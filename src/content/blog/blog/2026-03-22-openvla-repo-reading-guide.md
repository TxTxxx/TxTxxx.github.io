---
title: OpenVLA 仓库阅读指南：模型主线、ActionTokenizer 与训练入口
date: 2026-03-22
summary: 一篇面向初学者的 OpenVLA 仓库阅读指南，重点解释模型主线、ActionTokenizer、数据流和训练入口应该怎么串起来看。
tags:
  - openvla
  - robotics
  - repo-reading
category: embodied-ai
cover_image: /images/openvla-overview.png
cover_alt: OpenVLA system overview showing training data, VLA model, and closed-loop robot control
draft: false
---

# OpenVLA 仓库阅读指南：模型主线、ActionTokenizer 与训练入口

`openvla` 难读的地方通常不是某一行实现，而是入口选择。这个仓库同时包含 `PrismaticVLM`、动作离散化、RLDS 轨迹数据、训练配置、LoRA 微调和部署接口。如果一开始就顺着目录树平铺去看，很容易在不同层之间来回跳，但建立不起主线。

这篇文章的目标不是逐文件复述仓库，而是先把阅读顺序排出来。对第一次接触 OpenVLA 的人来说，先抓住推理链、动作 token 化和训练入口，比追着所有配置文件和数据细节跑更有效。

OpenVLA 的复杂度主要来自系统层次多，而不是实现故意写得绕。把主线理顺以后，仓库里的模块关系会清楚很多。

## 先建立 OpenVLA 的推理链和训练链

理解 OpenVLA 时，比目录结构更重要的是下面两条链路。


第一条链路是推理链，回答的是模型如何从图像和语言走到动作。  
第二条链路是训练链，回答的是机器人轨迹如何被改造成语言模型可以消费的样本。

这两条链路一旦建立起来，仓库里那些看起来分散的文件就会开始归位。真正需要优先理解的模块也会变得很清楚：`openvla.py`、`action_tokenizer.py`、`materialize.py`、`dataset.py`、`finetune.py`。

## OpenVLA 如何在 VLM 上增加动作输出能力

第一次看 OpenVLA，很容易下意识去找“模型主体”到底在哪。但往下读会发现，这个仓库真正新增的核心逻辑并没有想象中那么分散。

[`prismatic/models/vlas/openvla.py`](/Users/txtxx/code/python/openvla/prismatic/models/vlas/openvla.py) 的类定义已经把事情说得很直接：

```python
class OpenVLA(PrismaticVLM):
    def __init__(self, *args, norm_stats, action_tokenizer, **kwargs):
        super().__init__(*args, **kwargs)
        # 这两个状态决定了模型能不能把输出 token 解释回动作空间
        self.norm_stats = norm_stats
        self.action_tokenizer = action_tokenizer
```

这段代码背后的含义其实很重要：

- 视觉 backbone、语言 backbone、生成接口这些大件，主要来自 `PrismaticVLM`
- OpenVLA 自己加的东西不算多
- 但新增的部分恰好决定了它能不能输出机器人动作

这也是为什么 OpenVLA 不适合从最底层网络结构开始读。它的关键不在“重新定义了一个完全不同的 Transformer”，而在“怎么把原来生成文本 token 的 VLM 改造成生成动作 token 的 VLA”。

这类仓库最容易让人误判的地方就在这里。文件很多，不代表每一层同样重要。OpenVLA 更值得优先关注的是桥接层，而不是所有底层细节。

## 为什么 `predict_action()` 是最合适的入口

对第一次熟悉 OpenVLA 的人来说，最好的入口不是训练脚本，而是推理入口。

[`prismatic/models/vlas/openvla.py`](/Users/txtxx/code/python/openvla/prismatic/models/vlas/openvla.py) 里的 `predict_action()` 基本把主线完整写出来了：

```python
@torch.inference_mode()
def predict_action(self, image, instruction, unnorm_key=None, **kwargs):
    image_transform = self.vision_backbone.image_transform
    tokenizer = self.llm_backbone.tokenizer

    # 仍然先构造 prompt，说明 OpenVLA 没有抛弃语言模型范式
    prompt_builder = self.get_prompt_builder()
    prompt_builder.add_turn(
        role="human",
        message=f"What action should the robot take to {instruction.lower()}?"
    )
    prompt_text = prompt_builder.get_prompt()

    # 文本和图像的预处理路径依旧是熟悉的 VLM 方式
    input_ids = tokenizer(prompt_text, truncation=True, return_tensors="pt").input_ids.to(self.device)
    pixel_values = image_transform(image)

    # 关键不是 generate 本身，而是生成长度直接等于 action 维度
    # 这说明输出序列本质上已经不是自然语言，而是动作向量
    generated_ids = super(PrismaticVLM, self).generate(
        input_ids=input_ids,
        pixel_values=pixel_values[None, ...].to(self.device),
        max_new_tokens=self.get_action_dim(unnorm_key),
        **kwargs
    )

    # 取最后几个 token，并把它们解释成归一化动作
    predicted_action_token_ids = generated_ids[0, -self.get_action_dim(unnorm_key):]
    normalized_actions = self.action_tokenizer.decode_token_ids_to_actions(
        predicted_action_token_ids.cpu().numpy()
    )

    # 最后再根据训练时保存的统计量反归一化，得到真实动作尺度
    action_norm_stats = self.get_action_stats(unnorm_key)
    action_high = np.array(action_norm_stats["q99"])
    action_low = np.array(action_norm_stats["q01"])
    actions = 0.5 * (normalized_actions + 1) * (action_high - action_low) + action_low
    return actions
```

这段代码回答了 OpenVLA 最重要的三个问题：

1. 它仍然是生成式模型。
2. 它生成的已经不是普通文本，而是动作 token。
3. 动作 token 之所以能变成连续动作，靠的是 `ActionTokenizer` 和数据统计量。

这一点一旦看清，很多表面上的“复杂接口”反而会变得容易理解。OpenVLA 没有发明一套完全不同的推理逻辑，它只是沿用了 VLM 的生成接口，然后重新定义了输出 token 的语义。

例如，把动作离散化再反归一化的核心可以粗略理解为：

$$
\mathbf{a} = \frac{1}{2}(\hat{\mathbf{a}} + 1)\odot(\mathbf{q}_{99} - \mathbf{q}_{01}) + \mathbf{q}_{01}
$$

这里 $\hat{\mathbf{a}}$ 是 token 解码后的归一化动作，$\mathbf{q}_{01}$ 和 $\mathbf{q}_{99}$ 则来自训练时保存的动作统计量。

## `ActionTokenizer` 如何把连续动作映射成离散 token

如果只挑一个文件作为 OpenVLA 的技术核心，`train.py` 甚至都不是首选。更值得精读的是 [`prismatic/vla/action_tokenizer.py`](/Users/txtxx/code/python/openvla/prismatic/vla/action_tokenizer.py)。

原因很简单：机器人动作是连续值，而语言模型擅长的是离散 token。要把两者接起来，就必须解决动作 token 化的问题。

OpenVLA 的方案很工程化，也很直接。

### 它没有训练新词表，而是把动作映射到原词表的尾部 token

```python
class ActionTokenizer:
    def __init__(self, tokenizer, bins: int = 256, min_action: int = -1, max_action: int = 1):
        self.tokenizer = tokenizer
        self.n_bins = bins
        self.min_action = min_action
        self.max_action = max_action

        # 先把动作空间裁到固定范围，再均匀分桶
        self.bins = np.linspace(min_action, max_action, self.n_bins)
        self.bin_centers = (self.bins[:-1] + self.bins[1:]) / 2.0

        # 动作 token 直接占用词表末尾这批 token
        self.action_token_begin_idx = int(self.tokenizer.vocab_size - (self.n_bins + 1))
```

这套设计很值得正面说清楚。OpenVLA 没有：

- 单独训练一套动作词表
- 做复杂的向量量化
- 改造成连续动作回归头

它做的是：

- 先把动作裁到固定范围
- 然后均匀分桶
- 最后把桶编号映射到词表尾部 token

这不是最“精巧”的设计，但它非常符合工程现实。它尽可能复用了现成的自回归生成框架，让动作预测这件事可以直接嵌进语言模型的输出接口里。

这当然不是没有代价。均匀分桶天然会带来离散化误差。OpenVLA 在这里做的是一个明确的交换：牺牲一部分连续表达精度，换取系统层面的兼容性和实现简单性。

### 连续动作到 token 的映射，就是这么直接

```python
def __call__(self, action: np.ndarray):
    # 先裁范围，避免离散化越界
    action = np.clip(action, a_min=float(self.min_action), a_max=float(self.max_action))
    discretized_action = np.digitize(action, self.bins)

    # 核心约定：把动作桶编号映射成词表尾部 token
    return self.tokenizer.decode(list(self.tokenizer.vocab_size - discretized_action))
```

真正应该记住的是这一句：

```python
self.tokenizer.vocab_size - discretized_action
```

它意味着 OpenVLA 并没有改变“模型输出 token”这件事，而是改变了“这些 token 在这里代表什么”。这也是整套设计能和 VLM 原有生成接口自然接上的根本原因。

### 反解码回去时，得到的是桶中心，不是精确原值

```python
def decode_token_ids_to_actions(self, action_token_ids: np.ndarray) -> np.ndarray:
    # 从 token id 反推出动作桶编号
    discretized_actions = self.tokenizer.vocab_size - action_token_ids

    # `digitize` 的边界处理需要修正，否则最后一个桶会越界
    discretized_actions = np.clip(
        discretized_actions - 1,
        a_min=0,
        a_max=self.bin_centers.shape[0] - 1
    )

    # 最终返回的是桶中心
    return self.bin_centers[discretized_actions]
```

这里需要明确一点：模型学到的是“落在哪个桶”，不是精确的连续动作回归。所以它反解码得到的是桶中心，然后再交给 `predict_action()` 用训练时保存的统计量做反归一化。

如果这个地方没有想清楚，后面看训练代码时很容易误以为 OpenVLA 只是把动作“字符串化”了。实际上它做的是一整套动作离散化和反离散化约定。

## 为什么 OpenVLA 的数据层比普通 VLM 更复杂

相比模型层，第一次阅读 OpenVLA 更容易卡住的地方往往是数据层。因为从这里开始，仓库不再像一个纯 PyTorch 项目，而是开始同时出现 `tensorflow`、`tensorflow_datasets`、`dlimp` 和 `torch`。

这并不是为了复杂而复杂。原因很现实：OpenVLA 默认处理的是机器人轨迹数据，而不是普通的独立样本。轨迹意味着图像、动作、状态、语言、时间步和窗口要一起被组织。

[`prismatic/vla/materialize.py`](/Users/txtxx/code/python/openvla/prismatic/vla/materialize.py) 里的装配函数，是建立数据侧直觉最好的入口之一：

```python
def get_vla_dataset_and_collator(
    data_root_dir,
    data_mix,
    image_transform,
    tokenizer,
    prompt_builder_fn,
    default_image_resolution,
    ...
):
    # 训练标签最后也会变成 token，所以这里先构造动作 tokenizer
    action_tokenizer = ActionTokenizer(tokenizer)

    # 这一层把轨迹片段改造成模型能消费的 batch 样本
    batch_transform = RLDSBatchTransform(
        action_tokenizer,
        tokenizer,
        image_transform,
        prompt_builder_fn,
        predict_stop_token=predict_stop_token,
    )

    collator = PaddedCollatorForActionPrediction(
        tokenizer.model_max_length,
        tokenizer.pad_token_id,
        padding_side=padding_side,
    )

    dataset = RLDSDataset(
        data_root_dir,
        data_mix,
        batch_transform,
        resize_resolution=default_image_resolution[1:],
        shuffle_buffer_size=shuffle_buffer_size,
        train=train,
        image_aug=image_aug,
    )

    return dataset, action_tokenizer, collator
```

这段代码最关键的启发是：OpenVLA 的训练样本不是从磁盘上一条条直接读出来的，而是经过轨迹重组、动作 token 化、prompt 构造和 padding 之后动态形成的。

真正更重的部分在 [`prismatic/vla/datasets/rlds/dataset.py`](/Users/txtxx/code/python/openvla/prismatic/vla/datasets/rlds/dataset.py)。其中 `restructure()` 的作用尤其重要：

```python
def restructure(traj):
    traj_len = tf.shape(traj["action"])[0]
    old_obs = traj["observation"]
    new_obs = {}

    # 把不同数据集的图像字段统一改写成 image_*
    for new, old in image_obs_keys.items():
        if old is None:
            new_obs[f"image_{new}"] = tf.repeat("", traj_len)
        else:
            new_obs[f"image_{new}"] = old_obs[old]

    # 把状态统一拼到 proprio
    if state_obs_keys:
        new_obs["proprio"] = tf.concat(
            [
                tf.zeros((traj_len, 1), dtype=tf.float32) if key is None
                else tf.cast(old_obs[key], tf.float32)
                for key in state_obs_keys
            ],
            axis=1,
        )

    # 保留时间步，后面做窗口切片时会用到
    new_obs["timestep"] = tf.range(traj_len)

    # 语言指令统一挂到 task["language_instruction"] 下
    task = {}
    if language_key is not None:
        task["language_instruction"] = traj.pop(language_key)

    traj = {
        "observation": new_obs,
        "task": task,
        "action": tf.cast(traj["action"], tf.float32),
        "dataset_name": tf.repeat(name, traj_len),
    }
    return traj
```

这段代码其实在做一件非常重要的事：把不同机器人数据源压到同一种中间表示上。这样后面的训练逻辑就不用为每个数据集单独写一套分支。

这套设计的优点很明显：

- 多数据集混训更自然
- 数据格式统一后，模型和训练侧的接口更干净
- 微调脚本也可以复用同一套数据主线

但代价也不能回避：

- 阅读门槛明显变高
- TensorFlow 和 PyTorch 混用，调试路径更长
- 数据问题往往不会在最早的地方暴露出来

所以对于第一次读 OpenVLA 的人来说，数据层很重要，但它不是最适合拿来建立第一层理解的地方。

## `train.py` 在训练栈里负责什么

一旦前面的主线清楚了，再回头看训练脚本，理解就会轻很多。

比如 [`prismatic/conf/vla.py`](/Users/txtxx/code/python/openvla/prismatic/conf/vla.py) 其实不是普通的超参数文件，它更像“实验假设的编码方式”：

```python
@dataclass
class VLAConfig(ChoiceRegistry):
    vla_id: str
    base_vlm: Union[str, Path]
    freeze_vision_backbone: bool
    freeze_llm_backbone: bool
    unfreeze_last_llm_layer: bool

    data_mix: str
    shuffle_buffer_size: int

    expected_world_size: int
    global_batch_size: int
    per_device_batch_size: int

    learning_rate: float
    weight_decay: float
    max_grad_norm: float
    lr_scheduler_type: str
    warmup_ratio: float
    train_strategy: str
```

这里同时编码了很多决策：

- 从哪个基础 VLM 起步
- 训练使用哪种数据混合
- 哪些 backbone 冻结
- 预期多少 GPU
- 用什么训练策略

再去看 [`vla-scripts/train.py`](/Users/txtxx/code/python/openvla/vla-scripts/train.py)，它的角色就会很清楚：

```python
if not cfg.vla.freeze_vision_backbone and not cfg.vla.freeze_llm_backbone:
    stage = "vla-full-train"
elif cfg.vla.freeze_vision_backbone and not cfg.vla.freeze_llm_backbone:
    stage = "vla-train"
elif not cfg.vla.freeze_vision_backbone and cfg.vla.freeze_llm_backbone:
    stage = "vla-sandwich-train"
elif cfg.vla.freeze_vision_backbone and cfg.vla.freeze_llm_backbone:
    stage = "vla-last-layer-train"
else:
    raise ValueError(...)

vlm.freeze_backbones(stage)

vla_dataset, action_tokenizer, collator = get_vla_dataset_and_collator(
    cfg.data_root_dir,
    cfg.vla.data_mix,
    image_transform=vlm.vision_backbone.get_image_transform(),
    tokenizer=vlm.llm_backbone.get_tokenizer(),
    prompt_builder_fn=vlm.llm_backbone.prompt_builder_fn,
    default_image_resolution=vlm.vision_backbone.default_image_resolution,
    shuffle_buffer_size=cfg.vla.shuffle_buffer_size,
    image_aug=cfg.image_aug,
)
```

这更像一个 orchestration layer：

- 读配置
- 载入基础模型
- 决定冻结策略
- 拼好数据管线
- 接到训练策略上

它当然重要，但对于初次阅读来说，并不是最高性价比的入口。先看清推理主线，再回来理解 `train.py`，通常会顺很多。

## 为什么初次复现更适合先读 `finetune.py`

如果目标是完整复现大规模预训练设置，那么 `train.py` 是主角。  
但如果目标是尽快把 OpenVLA 跑在新任务上，或者先建立一个能动手的整体理解，那么 [`vla-scripts/finetune.py`](/Users/txtxx/code/python/openvla/vla-scripts/finetune.py) 更适合先读。

```python
processor = AutoProcessor.from_pretrained(cfg.vla_path, trust_remote_code=True)
vla = AutoModelForVision2Seq.from_pretrained(
    cfg.vla_path,
    torch_dtype=torch.bfloat16,
    quantization_config=quantization_config,
    low_cpu_mem_usage=True,
    trust_remote_code=True,
)

if cfg.use_lora:
    lora_config = LoraConfig(
        r=cfg.lora_rank,
        lora_alpha=min(cfg.lora_rank, 16),
        lora_dropout=cfg.lora_dropout,
        target_modules="all-linear",
        init_lora_weights="gaussian",
    )
    vla = get_peft_model(vla, lora_config)

action_tokenizer = ActionTokenizer(processor.tokenizer)
batch_transform = RLDSBatchTransform(
    action_tokenizer,
    processor.tokenizer,
    image_transform=processor.image_processor.apply_transform,
    prompt_builder_fn=PurePromptBuilder if "v01" not in cfg.vla_path else VicunaV15ChatPromptBuilder,
)
vla_dataset = RLDSDataset(
    cfg.data_root_dir,
    cfg.dataset_name,
    batch_transform,
    resize_resolution=tuple(vla.module.config.image_sizes),
    shuffle_buffer_size=cfg.shuffle_buffer_size,
    image_aug=cfg.image_aug,
)
```

这段代码把 OpenVLA 的主线暴露得很干净：

- 模型加载仍然走 Hugging Face 接口
- 参数高效训练走 LoRA
- 动作侧仍然复用 `ActionTokenizer`
- 数据侧仍然复用 RLDS 管线

这也是为什么 `finetune.py` 往往更适合作为第一次复现的入口。它没有绕开 OpenVLA 的核心设计，只是把它放进了一个更容易动手的工作流里。

## OpenVLA 的复杂度主要来自哪些层次

整体读下来，一个很明显的感受是：OpenVLA 不轻，但它并不乱。

它的复杂度主要来自层叠：

- 底层是 `PrismaticVLM`
- 中间有动作离散化
- 再上面是 RLDS 轨迹数据处理
- 最上面还有训练、微调和部署脚本

如果没有先抓住主线，这种层叠会显得非常重。  
但一旦先把 `predict_action()`、`ActionTokenizer` 和数据装配逻辑看清，仓库结构就会开始变得有秩序。

这也是为什么这篇文章一直在强调“入口”而不是“覆盖面”。第一次读这种仓库时，最容易浪费掉的不是时间，而是注意力。如果一开始把注意力放错层，后面很容易陷入细节，却抓不住真正关键的设计。

## 两小时熟悉 OpenVLA 的推荐阅读顺序

对于第一次接触 OpenVLA 的人，我会建议下面这个顺序：

1. 先跑 README 里的最小推理示例，确认输入和输出到底是什么。
2. 读 [`prismatic/models/vlas/openvla.py`](/Users/txtxx/code/python/openvla/prismatic/models/vlas/openvla.py)，重点只看 `predict_action()`。
3. 读 [`prismatic/vla/action_tokenizer.py`](/Users/txtxx/code/python/openvla/prismatic/vla/action_tokenizer.py)，真正搞懂动作 token 化。
4. 读 [`vla-scripts/finetune.py`](/Users/txtxx/code/python/openvla/vla-scripts/finetune.py)，建立“怎么把它跑起来”的感觉。
5. 最后再读 [`prismatic/vla/datasets/rlds/dataset.py`](/Users/txtxx/code/python/openvla/prismatic/vla/datasets/rlds/dataset.py) 和 [`vla-scripts/train.py`](/Users/txtxx/code/python/openvla/vla-scripts/train.py)，补齐完整训练链路。

如果这篇文章有用，作用应该是把第一次读 OpenVLA 的路径压短一些，让入口先稳定下来，再回头补最重的数据层和训练层。

接下来更值得继续写的两个问题其实也已经很明确了：

- OpenVLA 为什么选择动作离散化，而不是连续动作回归
- 如果要把自己的机器人数据接进 OpenVLA，RLDS 这一层到底该怎么改

这两个问题都比继续重复目录结构更有价值，因为它们真正对应的是复现时最容易卡住的地方。
