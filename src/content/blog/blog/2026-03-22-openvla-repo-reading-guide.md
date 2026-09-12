---
title: OpenVLA 仓库阅读指南：模型主线、ActionTokenizer 与训练入口
date: 2026-03-22
summary: 从 predict_action 读起，追踪 OpenVLA 的动作 token、RLDS 数据变换和微调入口。
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

OpenVLA 复用 VLM 的生成接口，把输出 token 解码为机器人动作。读仓库时可以从 `predict_action()` 开始，沿着动作解码追到 `ActionTokenizer`，再看训练样本怎样经过 RLDS 数据管线变成输入和标签。本文按这个顺序整理代码片段，最后比较预训练与微调入口。

## 先建立 OpenVLA 的推理链和训练链

推理时，图像和语言经过模型生成动作 token，再经解码和反归一化得到动作向量。训练时，机器人轨迹经过字段统一、动作 token 化和 padding，组成模型样本。

下面的片段摘出了相关调用，省略了部分上下文，不能作为独立脚本直接运行。

## OpenVLA 如何在 VLM 上增加动作输出能力

[`prismatic/models/vlas/openvla.py`](/Users/txtxx/code/python/openvla/prismatic/models/vlas/openvla.py) 中，`OpenVLA` 继承了 `PrismaticVLM`：

```python
class OpenVLA(PrismaticVLM):
    def __init__(self, *args, norm_stats, action_tokenizer, **kwargs):
        super().__init__(*args, **kwargs)
        # 这两个状态决定了模型能不能把输出 token 解释回动作空间
        self.norm_stats = norm_stats
        self.action_tokenizer = action_tokenizer
```

视觉、语言 backbone 和生成接口来自 `PrismaticVLM`。这里增加的 `action_tokenizer` 负责动作与 token 之间的转换，`norm_stats` 保存动作反归一化所需的统计量。

## 从 `predict_action()` 跟踪动作输出

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

`max_new_tokens` 取动作维度，生成结果的末尾几个 token 交给 `ActionTokenizer` 解码。随后用训练集的分位数统计量恢复动作尺度：

$$
\mathbf{a} = \frac{1}{2}(\hat{\mathbf{a}} + 1)\odot(\mathbf{q}_{99} - \mathbf{q}_{01}) + \mathbf{q}_{01}
$$

这里 $\hat{\mathbf{a}}$ 是 token 解码后的归一化动作，$\mathbf{q}_{01}$ 和 $\mathbf{q}_{99}$ 则来自训练时保存的动作统计量。

## `ActionTokenizer` 如何把连续动作映射成离散 token

动作的离散化和解码都在 [`prismatic/vla/action_tokenizer.py`](/Users/txtxx/code/python/openvla/prismatic/vla/action_tokenizer.py)。

这个模块把连续动作分桶，使模型可以沿用离散 token 的预测方式。

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

动作先被裁到固定范围，再均匀分桶，桶编号映射到原词表尾部的 token。这省去了单独训练动作词表的步骤，也能复用自回归生成接口；代价是连续值经过分桶后会有量化误差。

### 桶编号到 token ID 的映射

```python
def __call__(self, action: np.ndarray):
    # 先裁范围，避免离散化越界
    action = np.clip(action, a_min=float(self.min_action), a_max=float(self.max_action))
    discretized_action = np.digitize(action, self.bins)

    # 核心约定：把动作桶编号映射成词表尾部 token
    return self.tokenizer.decode(list(self.tokenizer.vocab_size - discretized_action))
```

token ID 按下面的式子计算：

```python
self.tokenizer.vocab_size - discretized_action
```

因此，词表尾部的这些 token 在动作输出中代表桶编号。

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

解码返回桶中心，无法恢复分桶前的精确值。`predict_action()` 再用训练时保存的统计量反归一化。

## 为什么 OpenVLA 的数据层比普通 VLM 更复杂

相比模型层，第一次阅读 OpenVLA 更容易卡住的地方往往是数据层。因为从这里开始，仓库不再像一个纯 PyTorch 项目，而是开始同时出现 `tensorflow`、`tensorflow_datasets`、`dlimp` 和 `torch`。

数据管线需要同时处理轨迹中的图像、动作、状态、语言和时间窗口。

[`prismatic/vla/materialize.py`](/Users/txtxx/code/python/openvla/prismatic/vla/materialize.py) 里的装配函数把这些处理连接起来：

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

这里可以看到，OpenVLA 的训练样本不是从磁盘上一条条直接读出来的，而是经过轨迹重组、动作 token 化、prompt 构造和 padding 之后动态形成的。

轨迹字段的处理在 [`prismatic/vla/datasets/rlds/dataset.py`](/Users/txtxx/code/python/openvla/prismatic/vla/datasets/rlds/dataset.py)。其中 `restructure()` 的作用尤其重要：

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

`restructure()` 将各数据源映射到统一字段，后续混训和微调便能复用相同接口。排查数据问题时，需要同时看原始字段和变换后的结果；TensorFlow 与 PyTorch 之间还有一段转换路径，仅检查训练 batch 不一定能找到出错的位置。

## `train.py` 在训练栈里负责什么

训练配置定义在 [`prismatic/conf/vla.py`](/Users/txtxx/code/python/openvla/prismatic/conf/vla.py)，包含基础模型、冻结策略、数据混合和训练参数：

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

`train.py` 根据配置选择冻结阶段，装配模型、数据和训练策略。要确认某次训练更新了哪些参数，需要对照这里的 `stage` 分支与 `freeze_backbones()`。

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

微调入口通过 Hugging Face 接口加载模型，按配置加入 LoRA，并复用 `ActionTokenizer` 和 RLDS 管线。接入新任务时，可以从这里核对模型路径、数据集名称和动作归一化配置。

## 阅读顺序

先运行 README 的推理示例，确认输入和输出。随后读 `predict_action()` 和 `ActionTokenizer`，把动作生成、解码、反归一化串起来。需要微调时再看 `finetune.py`；接入自己的机器人数据时，重点检查 RLDS 字段映射和动作统计量。完整预训练设置则需要继续读 `train.py` 及其训练策略。

这条顺序留下了两个需要另外展开的问题：动作离散化会损失多少精度，以及新数据集怎样对齐现有 RLDS schema。前者要结合动作分辨率和评估结果，后者需要拿一条真实轨迹逐字段检查。
