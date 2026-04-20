---
title: LoRA 如何降低大模型微调成本：低秩更新、部署与 QLoRA
date: 2026-03-29
summary: 从低秩更新、冻结主干参数到权重合并与 QLoRA，系统解释 LoRA 为什么能把大模型微调从“几乎训不起”变成“多数团队都能落地”。
tags:
  - lora
  - llm-finetuning
  - peft
  - qlora
  - transformers
cover_image: /images/lora-finetuning-cover.png
cover_alt: Diagram illustrating LoRA training with frozen pretrained weights, low-rank adapters, and merged weights after training
draft: false
---

# LoRA 如何降低大模型微调成本：低秩更新、部署与 QLoRA

`LoRA` 的价值不只是少训练一点参数，而是把大模型微调里最贵的训练状态从“整份主干都可训练”改成“只维护低秩增量”。一旦主干参数冻结，梯度、优化器状态、checkpoint 和任务切换的成本都会跟着变。

这也是它在大模型微调里被大量采用的原因。很多团队真正负担不起的不是模型文件本身，而是全量微调带来的显存、存储和实验迭代成本。

但 `LoRA` 也不是全量微调的无损替代。它依赖一个经验前提：不少下游任务所需的参数更新，可以压缩到较低维的子空间里。这个前提常常成立，但不是默认总成立。

这篇文章按一个直接、可验证的顺序来讲：

- 全量微调为什么贵，`LoRA` 到底改掉了哪一笔账
- `LoRA` 的低秩更新具体怎么工作，训练和合并时分别发生了什么
- `LoRA` 为什么常常够用，但也为什么不应该被神化
- `LoRA`、`QLoRA`、全量微调和其他 PEFT 方法到底怎么选

## 全量微调的成本来自哪些训练状态

先把最容易被忽略的事实摆在前面：训练时需要维护的，不只有模型参数。

如果我们把模型参数记为 $P$，梯度记为 $G$，优化器状态记为 $O$，那么一次普通的全量微调，大致要承担的是：

$$
\text{Training Memory} \approx P + G + O + \text{activations}
$$

对 `AdamW` 这种优化器来说，`O` 往往至少和参数规模同量级，很多实现里还会再叠加混合精度副本、梯度缓存和 checkpoint 开销。于是问题就变成了：

- 模型本体勉强能装下，不代表训练状态也装得下
- 每多一个下游任务，就可能多一份完整 checkpoint
- 想并行试几个学习率、数据配比、模板格式，成本会迅速放大

所以，全量微调最贵的地方不是“参数很多”这句废话，而是**每个任务都要求你维护一整套可训练主干模型及其训练状态**。

`LoRA` 的切入点正是这里。它不试图把整个模型重新训练一遍，而是问了一个更工程的问题：

> 如果一个下游任务真正需要的只是对原始权重的某种小幅、结构化修正，那我们有没有必要让整块权重都变成可训练参数？

## LoRA 如何把参数更新写成低秩分解

假设某一层线性映射原本写成：

$$
h = Wx
$$

其中 $W \in \mathbb{R}^{d \times k}$，输入 $x \in \mathbb{R}^{k}$，输出 $h \in \mathbb{R}^{d}$。

全量微调时，你直接更新整个矩阵 $W$。如果把更新量记为 $\Delta W$，那么微调后的映射是：

$$
h = (W + \Delta W)x
$$

`LoRA` 的关键假设是：这个 $\Delta W$ 不一定需要一个完整的 $d \times k$ 矩阵来表示。很多任务相关更新，可能可以近似写成两个更小矩阵的乘积：

$$
\Delta W = BA
$$

其中：

$$
B \in \mathbb{R}^{d \times r}, \quad A \in \mathbb{R}^{r \times k}, \quad r \ll \min(d, k)
$$

于是前向变成：

$$
h = Wx + BAx
$$

实践里通常还会加一个缩放项：

$$
h = Wx + \frac{\alpha}{r}BAx
$$

这里的 `rank = r` 控制的是低秩子空间大小，$\alpha / r$ 控制的是增量更新的有效幅度。它的作用更接近“训练时让更新规模更可控”，而不是某种神秘的性能开关。

这时最重要的工程变化出现了：

- 原始权重 `W` 冻结，不参与训练
- 只有 `A` 和 `B` 是可训练参数
- 优化器状态只需要为 `A` 和 `B` 维护

如果某个线性层原本是 `d x k`，全量微调需要训练 `dk` 个参数；而 `LoRA` 只训练：

$$
r(d + k)
$$

当 $r$ 很小时，这两者差别会非常大。

举个最简单的数量级例子。假设一个投影层维度是 `4096 x 4096`：

- 全量微调参数量：$4096 \times 4096 = 16,777,216$
- `LoRA(r=8)` 参数量：$8 \times (4096 + 4096) = 65,536$

这不是“少了一点”，而是直接从一千多万掉到六万多。对单层来说已经是两个量级的差距；对多层累加后，梯度和优化器状态的差距会继续放大。

## LoRA 的训练态和合并部署态有什么区别

下面这张图就是 `LoRA` 最应该被记住的样子：

![LoRA training and merged inference diagram](/images/lora-finetuning-cover.png)

图左边是训练时的结构。冻结的预训练权重 `W` 走主干路径，低秩适配器 `A`、`B` 走旁路，然后两路结果相加：

$$
h = Wx + BAx
$$

图里还画了一个很关键的初始化策略：

- `A` 随机初始化
- `B = 0`

这样做的目的不是好看，而是保证训练刚开始时：

$$
BA = 0
$$

于是模型初始输出与原模型保持一致，不会因为你刚插入 adapter 就把原始行为打乱。后续训练中，`B` 再从零开始逐步学到有效更新。

图右边表示的是合并后的状态。既然：

$$
h = (W + BA)x
$$

那训练完成后，我们完全可以把低秩更新直接并回主权重：

$$
W_{\text{merged}} = W + BA
$$

这也是 `LoRA` 在部署时很实用的一点。你可以有两种路线：

- 保持 `base model + adapter` 分开加载，方便同一个基座切多个任务
- 直接 merge 成单一权重，部署路径更接近普通模型

所以 `LoRA` 的价值不只是训练省显存。它同时改变了**训练、保存和发布**这三件事的成本结构。

## 为什么很多任务可以用低秩更新完成适配

这里要讲清一个边界。`LoRA` 的论文和大量后续实践都说明：很多下游任务上，参数更新可以被低秩近似得不错。但这不等于“所有任务的最优更新天然就是低秩”。

更准确的工程理解应该是：

- 预训练模型已经学到了大部分通用表示
- 下游任务需要的，往往是对某些表示方向做偏移、重加权或局部纠正
- 这类更新在不少情况下不需要完整自由度

换句话说，`LoRA` 不是重新从零学会语言建模，而是在原有能力上叠加一个相对低维的任务补丁。

这也是为什么它在下面几类场景尤其常见：

- 指令微调
- 领域适配，比如法律、医疗、金融问答
- 风格适配或格式约束
- 多任务场景下为同一基座维护多个 adapter

但它也有明确限制。如果任务偏移非常大，或者你确实需要重塑更深层的内部表示，低秩近似不一定够。你可能会看到：

- `rank` 提得很高以后效果才上来
- 只改 `q_proj`、`v_proj` 不够，需要覆盖更多模块
- 即使用了 `LoRA`，最终上限仍然不如全量微调

所以，正确的结论不是“LoRA 基本总能替代全量微调”，而是：

> 当任务更新确实集中在较低维子空间里时，LoRA 往往能用远低于全量微调的成本拿到足够好的结果。

## rank、alpha 和 target modules 分别影响什么

`LoRA` 实践里最常调的超参数，通常就三类：`rank`、`alpha` 和 `target_modules`。这三者都不是装饰项。

| 配置项 | 它控制什么 | 配小/配少的风险 | 配大/配多的风险 |
| --- | --- | --- | --- |
| `rank (r)` | 低秩更新的容量 | 欠拟合，适配能力不足 | 参数量、显存和训练不稳定性上升 |
| `alpha` | LoRA 更新的有效缩放 | 更新幅度太小，学得慢 | 更新过强，容易扰动原模型 |
| `target_modules` | 哪些线性层插入 LoRA | 改得不够，效果差 | 改得太广，成本上升且更难调 |

这里最常见的误区有两个。

第一个误区是把 `rank` 当成“越小越高级”。不是。`rank` 太小的时候，你省下来的不是成本，而是有效表达能力。尤其在复杂任务、长链推理或强领域迁移里，过低的 `rank` 很容易直接欠拟合。

第二个误区是“既然 LoRA 很省，那不如把所有线性层都插一遍”。这也不一定对。大模型实践里最常见的起点，通常还是 attention 中的 `q_proj`、`v_proj`，有些任务再扩到 `k_proj`、`o_proj` 或 MLP 投影层。真正该插哪些模块，应该由任务和实验结果决定，不是越多越先进。

## LoRA 在训练时具体省掉了什么

很多文章会说：`LoRA` 显存低，是因为可训练参数少。这个说法方向没错，但不够完整。真正省下来的不只有参数本身，还有与参数绑定的一整套训练状态。

先对比一下两种方式：

| 项目 | 全量微调 | LoRA 微调 |
| --- | --- | --- |
| 主干参数 | 全部可训练 | 冻结 |
| 梯度 | 为全部参数保存 | 仅为 LoRA 参数保存 |
| 优化器状态 | 覆盖全部参数 | 仅覆盖 LoRA 参数 |
| checkpoint | 每个任务一整份模型更常见 | 通常只存 adapter |
| 多任务切换 | 需要切完整模型 | 可复用同一 base model |

如果只盯着“训练参数量少了多少”，你会低估 `LoRA` 带来的工程变化。真正影响资源消耗的，是下面这整串连锁反应：

1. 冻结主干参数  
2. 主干参数不需要梯度  
3. 主干参数不需要优化器状态  
4. 任务版本通常只存 adapter  
5. 多个任务可以共享同一个 base model

所以，`LoRA` 的节省不是一个点，而是一条链。

## 一个最小可运行的 LoRA 训练示例

下面这段代码用 `transformers + peft` 演示一个最小可运行的 `LoRA` 微调流程。它不是完整生产训练脚本，但足够把最关键的机制讲清楚：主干模型怎么加载、LoRA 插在哪里、为什么保存出来通常只有 adapter 权重。

```python
import torch
from torch.utils.data import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
from peft import LoraConfig, TaskType, get_peft_model


class ToySFTDataset(Dataset):
    def __init__(self, tokenizer):
        # 这里只放最小样例，真实训练时换成你的指令数据即可。
        samples = [
            "### Instruction:\n解释 LoRA 为什么能降低微调成本。\n### Response:\nLoRA 冻结主干参数，只训练低秩增量，因此减少了梯度和优化器状态开销。",
            "### Instruction:\nQLoRA 和 LoRA 的区别是什么？\n### Response:\nQLoRA 在量化基座模型的前提下训练 LoRA 适配器，重点是把更大的模型装进有限显存。"
        ]
        self.features = []
        for text in samples:
            encoded = tokenizer(
                text,
                truncation=True,
                max_length=256,
                padding="max_length",
                return_tensors="pt"
            )
            # Causal LM 训练里，labels 通常直接复制 input_ids。
            self.features.append(
                {
                    "input_ids": encoded["input_ids"].squeeze(0),
                    "attention_mask": encoded["attention_mask"].squeeze(0),
                    "labels": encoded["input_ids"].squeeze(0)
                }
            )

    def __len__(self):
        return len(self.features)

    def __getitem__(self, idx):
        return self.features[idx]


model_name = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
tokenizer = AutoTokenizer.from_pretrained(model_name)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
    device_map="auto" if torch.cuda.is_available() else None
)

lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8,
    lora_alpha=16,
    lora_dropout=0.05,
    # 这里先从 q_proj / v_proj 起步，是因为它们通常是最常见、最稳妥的 LoRA 注入点。
    target_modules=["q_proj", "v_proj"],
    bias="none"
)

# get_peft_model 会包装模型，并默认只让 LoRA 参数参与训练。
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

train_dataset = ToySFTDataset(tokenizer)

training_args = TrainingArguments(
    output_dir="./outputs/lora-demo",
    per_device_train_batch_size=1,
    gradient_accumulation_steps=4,
    num_train_epochs=1,
    learning_rate=2e-4,
    logging_steps=1,
    save_strategy="epoch",
    bf16=torch.cuda.is_available(),
    fp16=False,
    report_to="none"
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset
)

trainer.train()

# 默认保存的是 adapter 相关权重和配置，而不是整份 base model。
model.save_pretrained("./outputs/lora-demo/final-adapter")
tokenizer.save_pretrained("./outputs/lora-demo/final-adapter")
```

这段代码里最重要的不是 API 名字，而是它背后的状态变化：

- `from_pretrained()` 先加载完整基座模型
- `get_peft_model()` 再把 `LoRA` 注入到目标模块
- 训练时真正更新的是 adapter 参数，不是整份主干
- 保存时通常只落 adapter 权重和 `peft` 配置

如果你的目标是为一个基座模型维护多个任务版本，这种存储方式非常实用。你不需要为每个任务都复制一整份模型，只要保存各自的 adapter 即可。

## LoRA 部署时的两种权重组织方式

训练结束后，`LoRA` 模型通常有两种部署方式。

第一种是运行时加载 `base model + adapter`。它的优点很直接：

- 多个任务共用同一个基座
- 切换任务只需切换 adapter
- 适合多租户、多领域、多版本试验

代价也很直接：

- 部署链路要额外管理 adapter
- 推理服务要清楚当前请求绑定的是哪个 adapter
- 某些推理框架对 adapter 热切换支持不完全一致

第二种是把权重 merge 到主干里：

$$
W_{\text{merged}} = W + \frac{\alpha}{r}BA
$$

它更接近普通单模型部署，适合：

- 任务已经稳定，不需要频繁切换
- 推理框架希望直接吃单份权重
- 你不想在服务侧维护额外 adapter 生命周期

但 merge 之后，也就失去了一个基座快速切多个 adapter 的便利。怎么选，不是看谁更“高级”，而是看你的服务形态。

## QLoRA 解决的是什么问题

很多人会把 `QLoRA` 和 `LoRA` 混着说，这会把问题讲坏。两者不是一回事。

- `LoRA`：一种参数高效微调方法，核心是冻结主干、训练低秩增量
- `QLoRA`：在量化基座模型的前提下，再训练 LoRA adapter 的组合方案

这两者面对的问题层级不一样。

如果你的基座模型本体已经能装进显存，但全量微调的训练状态装不下，那么普通 `LoRA` 就已经可能够用。

如果你的基座模型本体都很难装下，或者即便装下也几乎没有余量做训练，那你就需要进一步把基座压缩到更低比特。`QLoRA` 的主线正是：

1. 把 base model 量化到更低精度，比如 `4-bit`
2. 冻结量化后的主干
3. 在其上训练 `LoRA` adapter

这会进一步降低资源门槛，但代价也必须写清楚：

- 训练和推理链路更复杂
- 数值稳定性更依赖具体实现
- 某些硬件和推理后端对量化支持并不完全一致
- “能训起来”不等于“效果一定等于全量微调”

所以 `QLoRA` 的价值主要是把更大的模型带进可训练区间，不是默认帮你拿到最高上限。

## LoRA、QLoRA、全量微调和 Adapter 的区别

如果只看“都能做微调”，这些方法很容易被说成一类。但工程上，它们关心的问题并不相同。

| 方法 | 改什么 | 训练成本 | 部署方式 | 更适合什么场景 |
| --- | --- | --- | --- | --- |
| 全量微调 | 全部参数 | 最高 | 单模型权重 | 资源充足，追求任务上限 |
| LoRA | 在线性层上加低秩增量 | 低 | adapter 分离或 merge | 大多数资源受限的任务适配 |
| QLoRA | 量化主干 + LoRA | 更低的显存门槛 | 通常先训练 adapter，再按需要部署 | 模型本体都偏大，资源更紧 |
| 经典 Adapter | 插入额外小模块 | 中低 | 常保留额外模块 | 需要模块化扩展，但未必追求最小改动 |
| Prompt / Prefix Tuning | 不改主干权重，只调提示相关参数 | 很低 | 推理时保留额外提示结构 | 更轻量试验，效果上限更依赖任务 |

严格说，`LoRA` 也是 Adapter 思路的一种特化实现，但它的优势在于：更新直接作用在原始线性层权重的增量上，训练和 merge 路径都比较清晰，所以在 LLM 微调里传播得更广。

## 什么时候适合优先使用 LoRA

如果你只想带走一段决策建议，可以记下面这几条。

优先考虑 `LoRA` 的情况：

- 你只有单卡或少量多卡，资源预算有限
- 你需要为同一个基座维护多个任务版本
- 你关心的是快速迭代和可复用性，而不是极限上限
- 基座模型本体装得下，但全量训练状态太贵

优先考虑 `QLoRA` 的情况：

- 基座模型本体就已经很大
- 普通 `LoRA` 也很难把训练塞进当前显存预算
- 你愿意接受更复杂的量化训练链路

需要认真评估甚至考虑全量微调的情况：

- 任务偏移很大，模型内部表示需要明显重塑
- 你追求的不是“够用”，而是任务上的最好指标
- 你已经验证过较高 `rank` 和更广的 target modules，仍然不够

`LoRA` 把大模型任务适配从高成本训练问题改成了更容易管理的工程问题，但它依然需要按任务做判断。更稳妥的做法是先问清三件事：

1. 你卡的是模型本体、训练状态，还是实验迭代成本？
2. 你的任务更新，是否真的可以用较低秩子空间表达？
3. 你的部署方式，是更适合多 adapter 共存，还是单权重 merge 上线？

这三个问题如果没有先答清，`LoRA` 很容易被用成默认选项，而不是经过验证的折中方案。

## 参考资料

- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
- [Hugging Face PEFT 文档：LoRA](https://huggingface.co/docs/peft/en/package_reference/lora)
- [PEFT 官方仓库](https://github.com/huggingface/peft)
- [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314)
