---
title: Steerable Policies vs OpenVLA：低层控制接口、steering commands 与 embodied reasoner
date: 2026-04-20
summary: 对照 OpenVLA，阅读 steering commands 的时间步对齐、reasoner 训练目标，以及外部标注和部署依赖。
tags:
  - openvla
  - robotics
  - steerable-policies
  - embodied-ai
  - code-reading
category: embodied-ai
cover_image: /images/steerable-policies-bridge-cover.png
cover_alt: Screenshot of the Steerable Policies project page showing human, VLM, and low-level policy interaction modes
draft: false
---

# Steerable Policies vs OpenVLA：低层控制接口、steering commands 与 embodied reasoner

`steerable-policies-bridge` 修改了 OpenVLA 的语言监督和低层 policy 接口。OpenVLA 默认学习 task-level instruction 到 action 的映射；Steerable Policies 则把监督信号改成更细粒度的 steering commands，并额外支持 `RATIONALE -> COMMAND -> ACTION` 这种 embodied reasoner 训练目标。

下面从数据变换开始，看中间命令怎样与轨迹时间步对齐，再看 reasoner 的目标文本与部署依赖。

## OpenVLA 关注通用 VLA 训练，Steerable Policies 关注低层控制接口

[OpenVLA](https://arxiv.org/abs/2406.09246) 的定位很清楚：一个开源的 vision-language-action model，重点是通用 VLA 的训练、微调和部署。它强调的是开放权重、真实机器人 demonstrations、可扩展训练骨架，以及相比闭源模型更实用的 fine-tuning 路线。

`steerable-policies-bridge` 基于 OpenVLA，公开训练代码围绕 Bridge 数据集组织。

Steerable Policies 对准的问题也和 OpenVLA 不同。论文 [Steerable Vision-Language-Action Policies for Embodied Reasoning and Hierarchical Control](https://arxiv.org/abs/2602.13193) 讨论的是另一类瓶颈：在很多 hierarchical robotics 系统里，高层 VLM 可以推理，但低层 VLA 只能接受一句很粗的自然语言任务描述。高层即使想表达“先绕开障碍，再抓住盘子边缘的蘑菇”，最后也可能只能退化成一句 “pick up the mushroom”。

因此，训练数据需要让低层 policy 接触这些中间命令，仅在推理时更换高层提示词并不足以建立这种对应关系。

## 语言监督在数据变换中被替换

在 OpenVLA 的常规范式里，VLA 学的是一件很标准的事：

- 输入：图像 + 语言任务描述
- 输出：action tokens

Steerable Policies 保留了这个整体形式，但换掉了语言侧的监督来源。关键代码在 [prismatic/vla/datasets/datasets.py](/Users/txtxx/code/python/steerable-policies-bridge/prismatic/vla/datasets/datasets.py:61) 的 `RLDSBatchTransform`。

它会先从每个样本里取出 `frame_idx`，还原出 `file_name`、`episode_id` 和 `time_idx`，再去查一组外部 Bridge 标注：

- `traj_idx_key_map.json`
- `subtask_level_commands.json`
- `step_to_subtask_dict.json`
- `rationales.json`

这些文件的根路径由 `PATH_TO_REASONING_DATA` 指定。数据变换会读取这些标注：

```python
# 这组外部标注决定当前 step 能否被映射到更细粒度的 steering command。
PATH_TO_REASONING_DATA = "</path/to/steering_features_bridge>"
PATH_TO_TRAJ_IDX_KEY_MAP = os.path.join(PATH_TO_REASONING_DATA, "traj_idx_key_map.json")
PATH_TO_SUBTASK_LEVEL_COMMANDS = os.path.join(PATH_TO_REASONING_DATA, "subtask_level_commands.json")
PATH_TO_STEP_TO_SUBTASK = os.path.join(PATH_TO_REASONING_DATA, "step_to_subtask_dict.json")
PATH_TO_RATIONALES = os.path.join(PATH_TO_REASONING_DATA, "rationales.json")

with open(PATH_TO_SUBTASK_LEVEL_COMMANDS, "r") as f:
    subtask_level_commands = json.load(f)
with open(PATH_TO_STEP_TO_SUBTASK, "r") as f:
    step_to_subtask = json.load(f)
```

`RLDSBatchTransform` 按当前时间步查询命令，缺少对应标注时退回原始任务语言：

```python
lang = rlds_batch["task"]["language_instruction"].decode().lower()
frame_idx = rlds_batch["frame_idx"].decode()

# 先把当前帧映射回“轨迹 + 时间步”，再去外部标注里查它属于哪个 subtask。
file_name, episode_id, time_idx = frame_idx.split("--")
traj_idx = str(key_to_traj_idx[f"{file_name}-{episode_id}"])

try:
    # 命中 subtask 标注时，优先取更细粒度的 steering commands。
    subtask = step_to_subtask[traj_idx][time_idx]
    commands = subtask_level_commands[traj_idx][subtask]
    command = commands[np.random.randint(len(commands))].strip().lower()
    command += "." if command[-1] != "." else ""
except KeyError:
    # 查不到标注时，才退回原始 task-level language。
    command = lang
```

这里的随机采样发生在当前 subtask 的候选命令中。复现时除了检查标注路径，还需要确认 `frame_idx` 能正确映射到轨迹和时间步。

## 命令粒度与数据依赖

两套训练接口的差别如下：

| 维度 | OpenVLA | `steerable-policies-bridge` |
| --- | --- | --- |
| 训练语言标签 | 以 task-level instruction 为主 | 优先替换为 step 对齐的 steering commands |
| 外部标注依赖 | 通常不要求额外分层命令标注 | 强依赖 `steering_features_bridge` 标注资产 |
| 低层接口粒度 | 任务级自然语言 | 子任务、动作风格、指向、轨迹等更细粒度命令 |
| 高层推理对低层的影响 | 间接，通常只能改任务表述 | 直接，高层可以显式发 steering command |
| 代码落点 | 通用 VLA 数据和训练骨架 | 在 OpenVLA 骨架上重写语言监督逻辑 |

这也是为什么论文会反复强调 “rich synthetic commands at various levels of abstraction”。从项目页给出的示例看，这些命令不只是 task-level commands，还包括 semantic subtasks、atomic motions、pointing，甚至带像素坐标的 gripper traces。

## 这个仓库还多了一条 embodied reasoner 的训练路径

除普通 steering policy 外，仓库也支持 embodied reasoner 训练。

关键实现还是在 [prismatic/vla/datasets/datasets.py](/Users/txtxx/code/python/steerable-policies-bridge/prismatic/vla/datasets/datasets.py:166) 的 `ReasonerRLDSBatchTransform`。

普通 `RLDSBatchTransform` 的 supervision 比较直接：

- human turn: command
- gpt turn: action tokens

而 `ReasonerRLDSBatchTransform` 生成的是另一种目标文本：

```text
RATIONALE: ...
COMMAND: ...
ACTION: ...
```

目标文本按 rationale、command、action 的顺序构造；前两项存在时才写入：

```python
output = ""
if rationale is not None:
    # reasoner 先显式写出为什么要这么做。
    output += f"RATIONALE: {rationale}\n"
if command is not None:
    # 然后把高层推理压成一个低层可执行的 steering command。
    output += f"COMMAND: {command}\n"

# 最后才落到 action tokens。
output += f"ACTION: {tokenized_action}"

conversation.extend(
    [
        {"from": "human", "value": lang},
        {"from": "gpt", "value": output},
    ]
)
```

训练配置通过 `train_reasoner` 选择对应的数据变换：

```python
@dataclass
class TrainConfig:
    future_action_window_size: int = 0
    use_fast_tokenizer: bool = False
    # 这行决定训练的是普通 steering policy，还是带 rationale 的 reasoner。
    train_reasoner: bool = False

if train_reasoner:
    # 打开后，dataset factory 会切到 ReasonerRLDSBatchTransform。
    batch_transform = ReasonerRLDSBatchTransform(...)
else:
    batch_transform = RLDSBatchTransform(...)
```

## 这些改动换来了什么能力

这套接口允许不同来源的中间命令驱动低层 policy。项目展示了以下控制方式：

- 人类直接发 steering commands
- 学到的 embodied reasoner 生成高层命令
- off-the-shelf VLM 通过 in-context learning 生成高层命令

运行完整的分层控制系统时，还需要分别配置各组件：

- 机器人侧负责相机、状态和动作执行
- policy 侧负责低层 action prediction
- reasoner 侧可以单独 host 一个高层 VLM
- `steerable-gym` 和 `AgentLace` 负责把这些组件串起来

## 代价和限制同样很具体

复现时有几项额外依赖：

1. 对外部标注资产有强依赖。  
   你要复现的不只是模型训练，还包括一整套 steering annotation pipeline。

2. 对数据集和平台有明显绑定。  
   当前公开代码围绕 Bridge 数据组织，不是一个拿来就能迁到任意机器人平台的通用升级包。

3. 工程形态从单仓库训练，走向多组件控制系统。  
   你不只要管 policy checkpoint，还要管 reasoner、server-client 通信和在线控制链路。

迁移到其他平台时，需要重新检查命令标注、动作定义和在线通信，不能只替换 policy checkpoint。

## 迁移时先检查数据接口

这份代码给出的实现路径是：按时间步查询 steering command，用它训练低层动作预测，再按需要加入 reasoner。是否适合自己的系统，首先取决于数据中有没有可对齐的中间命令，以及低层动作与这些命令是否一致。模型加载成功只能说明权重和配置兼容，命令是否有效还需要闭环评估。

## 参考链接

- [Steerable Policies 论文](https://arxiv.org/abs/2602.13193)
- [Steerable Policies 项目页](https://steerable-policies.github.io/)
- [本仓库](https://github.com/steerable-policies/steerable-policies-bridge)
- [OpenVLA 论文](https://arxiv.org/abs/2406.09246)
- [OpenVLA 仓库](https://github.com/openvla/openvla)

## 文中重点对应源码

- 训练时读取 steering annotations：`prismatic/vla/datasets/datasets.py`
- 普通 steering policy 数据变换：`RLDSBatchTransform`
- embodied reasoner 数据变换：`ReasonerRLDSBatchTransform`
- reasoner 模式切换：`prismatic/vla/materialize.py`
- 训练入口开关：`vla-scripts/train.py`
- 分层推理与部署说明：`README.md`
