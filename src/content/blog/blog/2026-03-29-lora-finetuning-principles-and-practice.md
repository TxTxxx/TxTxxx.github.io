---
title: LoRA 如何降低大模型微调成本：低秩更新、部署与 QLoRA
date: 2026-03-29
summary: 说明 LoRA 的低秩更新、训练状态节省和权重合并，比较普通 LoRA 与量化基座上的 QLoRA。
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

`LoRA` 冻结预训练权重，只训练低秩增量，减少需要保存的梯度和优化器状态。不同任务可以共享基座，分别保存 adapter。

这种限制也会影响模型的适配能力。低秩更新是否够用，需要结合任务、rank 和注入模块验证。下面从单个线性层开始，计算参数量，再讨论训练与部署时的差别。

## 全量微调的成本来自哪些训练状态

训练显存包括模型参数、梯度、优化器状态和激活。

如果我们把模型参数记为 $P$，梯度记为 $G$，优化器状态记为 $O$，那么一次普通的全量微调，大致要承担的是：

$$
\text{Training Memory} \approx P + G + O + \text{activations}
$$

对 `AdamW` 这种优化器来说，`O` 往往至少和参数规模同量级，很多实现里还会再叠加混合精度副本、梯度缓存和 checkpoint 开销。于是问题就变成了：

- 模型本体勉强能装下，不代表训练状态也装得下
- 每多一个下游任务，就可能多一份完整 checkpoint
- 想并行试几个学习率、数据配比、模板格式，成本会迅速放大

`LoRA` 将可训练部分限制为低秩增量，从而避免为冻结的主干保存梯度和优化器状态。基座权重和计算所需的激活仍然要占用显存。

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

`rank = r` 限制更新矩阵的秩，$\alpha/r$ 则缩放旁路输出。调整缩放时，还需要一起考虑学习率。

训练状态相应变为：

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

这个例子中，可训练参数量是原矩阵的 $1/256$。梯度和优化器状态也随可训练参数减少，但整体显存不会按同一比例缩小。

## LoRA 的训练态和合并部署态有什么区别

下图对照训练和合并后的结构：

![LoRA training and merged inference diagram](/images/lora-finetuning-cover.png)

图左边是训练时的结构。冻结的预训练权重 `W` 走主干路径，低秩适配器 `A`、`B` 走旁路，然后两路结果相加：

$$
h = Wx + BAx
$$

图中采用以下初始化：

- `A` 随机初始化
- `B = 0`

初始化时满足：

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

合并时也要带上训练使用的 $\alpha/r$；上面的示意图省略了这一缩放。

## 为什么很多任务可以用低秩更新完成适配

低秩适配利用的是预训练表示。它在一些任务中有效，可能有以下原因：

- 预训练模型已经学到了大部分通用表示
- 下游任务需要的，往往是对某些表示方向做偏移、重加权或局部纠正
- 这类更新在不少情况下不需要完整自由度

这是一种对参数更新的限制，不是关于所有下游任务最优解的保证。

这也是为什么它在下面几类场景尤其常见：

- 指令微调
- 领域适配，比如法律、医疗、金融问答
- 风格适配或格式约束
- 多任务场景下为同一基座维护多个 adapter

但它也有明确限制。如果任务偏移非常大，或者你确实需要重塑更深层的内部表示，低秩近似不一定够。你可能会看到：

- `rank` 提得很高以后效果才上来
- 只改 `q_proj`、`v_proj` 不够，需要覆盖更多模块
- 即使用了 `LoRA`，最终上限仍然不如全量微调

因此，应当比较不同 rank 和目标模块的验证结果，再判断是否需要全量微调。

## rank、alpha 和 target modules 分别影响什么

`rank`、`alpha` 和 `target_modules` 分别影响更新容量、缩放和作用位置。

| 配置项 | 它控制什么 | 配小/配少的风险 | 配大/配多的风险 |
| --- | --- | --- | --- |
| `rank (r)` | 低秩更新的容量 | 欠拟合，适配能力不足 | 参数量、显存和训练不稳定性上升 |
| `alpha` | LoRA 更新的有效缩放 | 更新幅度太小，学得慢 | 更新过强，容易扰动原模型 |
| `target_modules` | 哪些线性层插入 LoRA | 改得不够，效果差 | 改得太广，成本上升且更难调 |

较小的 rank 节省资源，也可能欠拟合。扩大目标模块同样增加可训练参数，并改变模型能调整的位置。可以从 `q_proj`、`v_proj` 等明确的模块组合做对照，再尝试 `k_proj`、`o_proj` 或 MLP 投影层；这些名称也要与具体模型结构对应。

## LoRA 在训练时具体省掉了什么

冻结主干后，节省的主要是它对应的梯度和优化器状态。两种方式可按下面几项对照：

| 项目 | 全量微调 | LoRA 微调 |
| --- | --- | --- |
| 主干参数 | 全部可训练 | 冻结 |
| 梯度 | 为全部参数保存 | 仅为 LoRA 参数保存 |
| 优化器状态 | 覆盖全部参数 | 仅覆盖 LoRA 参数 |
| checkpoint | 每个任务一整份模型更常见 | 通常只存 adapter |
| 多任务切换 | 需要切完整模型 | 可复用同一 base model |

保存 adapter 时，需要同时记录基座版本和配置，否则之后无法可靠地恢复同一个模型。

## LoRA 训练流程示例

下面用 `transformers + peft` 展示加载基座、注入 LoRA、训练和保存 adapter 的顺序。它使用玩具数据，不作为训练效果或跨环境可运行性的验证。用于实际 SFT 前，还需屏蔽 padding 位置的 labels，并检查硬件是否支持 BF16；多卡训练也需单独配置设备分配。

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

代码中的调用顺序是：

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

合并后得到单份任务权重。如果仍需要快速切换任务，应保留原始基座和各个 adapter。

## QLoRA 解决的是什么问题

先区分两个名称：

- `LoRA`：一种参数高效微调方法，核心是冻结主干、训练低秩增量
- `QLoRA`：在量化基座模型的前提下，再训练 LoRA adapter 的组合方案

量化基座进一步减少的是基座权重的存储。

如果你的基座模型本体已经能装进显存，但全量微调的训练状态装不下，那么普通 `LoRA` 就已经可能够用。

如果你的基座模型本体都很难装下，或者即便装下也几乎没有余量做训练，那你就需要进一步把基座压缩到更低比特。`QLoRA` 的主线正是：

1. 把 base model 量化到更低精度，比如 `4-bit`
2. 冻结量化后的主干
3. 在其上训练 `LoRA` adapter

采用量化训练还需检查：

- 训练和推理链路更复杂
- 数值稳定性更依赖具体实现
- 某些硬件和推理后端对量化支持并不完全一致
- “能训起来”不等于“效果一定等于全量微调”

`QLoRA` 可降低基座占用，但任务效果仍需要与未量化方案对照。

## LoRA、QLoRA、全量微调和 Adapter 的区别

如果只看“都能做微调”，这些方法很容易被说成一类。但工程上，它们关心的问题并不相同。

| 方法 | 改什么 | 训练成本 | 部署方式 | 更适合什么场景 |
| --- | --- | --- | --- | --- |
| 全量微调 | 全部参数 | 最高 | 单模型权重 | 资源充足，追求任务上限 |
| LoRA | 在线性层上加低秩增量 | 低 | adapter 分离或 merge | 大多数资源受限的任务适配 |
| QLoRA | 量化主干 + LoRA | 更低的显存门槛 | 通常先训练 adapter，再按需要部署 | 模型本体都偏大，资源更紧 |
| 经典 Adapter | 插入额外小模块 | 中低 | 常保留额外模块 | 需要模块化扩展，但未必追求最小改动 |
| Prompt / Prefix Tuning | 不改主干权重，只调提示相关参数 | 很低 | 推理时保留额外提示结构 | 更轻量试验，效果上限更依赖任务 |

`LoRA` 的增量可以合入线性层权重，这使它与推理时保留额外非线性模块的 Adapter 方案有所区别。

## 根据资源限制选择微调方式

如果基座能放下，但全量微调的梯度和优化器状态超出预算，可以先测试 LoRA。基座本身占用过大时，再评估 QLoRA 及硬件的量化支持。

若增大 rank、扩展目标模块后仍未达到任务要求，就需要与全量微调做对照，而不能只用参数量判断方法是否合适。部署时另做一个选择：多个任务共享基座，还是合并成单份权重。训练省下的资源与服务端的管理成本，需要分别计算。

## 参考资料

- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
- [Hugging Face PEFT 文档：LoRA](https://huggingface.co/docs/peft/en/package_reference/lora)
- [PEFT 官方仓库](https://github.com/huggingface/peft)
- [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314)
