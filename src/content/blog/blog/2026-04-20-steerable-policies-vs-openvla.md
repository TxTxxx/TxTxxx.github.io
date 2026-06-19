---
title: Steerable Policies vs OpenVLA：低层控制接口、steering commands 与 embodied reasoner
date: 2026-04-20
summary: 从数据变换、steering command 监督到 reasoner 训练目标，拆清 Steerable Policies 在 OpenVLA 骨架上到底改了哪一层接口，以及这些改动的收益与代价。
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

`steerable-policies-bridge` 不是在 OpenVLA 上再包一层训练脚本，它真正改的是低层 policy 的语言接口。OpenVLA 默认学习 task-level instruction 到 action 的映射；Steerable Policies 则把监督信号改成更细粒度的 steering commands，并额外支持 `RATIONALE -> COMMAND -> ACTION` 这种 embodied reasoner 训练目标。

这件事值得单独拆开讲，因为它对应的是很多机器人系统都会遇到的一个实际瓶颈：高层 VLM 可能已经能做出更细的推理，但低层 policy 只接受一句很粗的任务描述，于是高层信息根本传不下去。Steerable Policies 的切入点不是换一个更大的 backbone，而是先把低层执行器“能听懂什么”这件事改掉。

这篇文章主要看三件事：

- Steerable Policies 和 OpenVLA 分别在解决什么问题
- 这个仓库具体在哪些代码位置改了语言监督和训练目标
- 这些改动换来了什么能力，又引入了什么耦合和代价

## OpenVLA 关注通用 VLA 训练，Steerable Policies 关注低层控制接口

[OpenVLA](https://arxiv.org/abs/2406.09246) 的定位很清楚：一个开源的 vision-language-action model，重点是通用 VLA 的训练、微调和部署。它强调的是开放权重、真实机器人 demonstrations、可扩展训练骨架，以及相比闭源模型更实用的 fine-tuning 路线。

`steerable-policies-bridge` 从 README 第一屏就把自己的定位写得很明确：它是训练 **Steerable Policies on the Bridge dataset** 的代码库，而且是 **built atop OpenVLA**。这句话不是客套，而是最准确的技术描述。

Steerable Policies 对准的问题也和 OpenVLA 不同。论文 [Steerable Vision-Language-Action Policies for Embodied Reasoning and Hierarchical Control](https://arxiv.org/abs/2602.13193) 讨论的是另一类瓶颈：在很多 hierarchical robotics 系统里，高层 VLM 可以推理，但低层 VLA 只能接受一句很粗的自然语言任务描述。高层即使想表达“先绕开障碍，再抓住盘子边缘的蘑菇”，最后也可能只能退化成一句 “pick up the mushroom”。

这个仓库的核心判断可以压成一句话：很多系统的瓶颈不是高层模型不够聪明，而是低层 policy 的输入接口太粗。Steerable Policies 没有重造 OpenVLA，而是把 OpenVLA 改造成一个更可操控的低层执行器。

## 最大的改动发生在语言监督，而不是 backbone

从源码上看，这个仓库最值得读的不是模型类，而是数据变换逻辑。

在 OpenVLA 的常规范式里，VLA 学的是一件很标准的事：

- 输入：图像 + 语言任务描述
- 输出：action tokens

Steerable Policies 保留了这个整体形式，但换掉了语言侧的监督来源。关键代码在 [prismatic/vla/datasets/datasets.py](/Users/txtxx/code/python/steerable-policies-bridge/prismatic/vla/datasets/datasets.py:61) 的 `RLDSBatchTransform`。

它会先从每个样本里取出 `frame_idx`，还原出 `file_name`、`episode_id` 和 `time_idx`，再去查一组外部 Bridge 标注：

- `traj_idx_key_map.json`
- `subtask_level_commands.json`
- `step_to_subtask_dict.json`
- `rationales.json`

这些文件的根路径由 `PATH_TO_REASONING_DATA` 指定。代码里直接把这部分资产命名成 `reasoning data`，说明这不是旁路增强，而是训练逻辑的一部分：

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

更关键的是，`RLDSBatchTransform` 真的会用这些标注替换掉原始任务语言：

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

这段代码把两者的差别写得非常直接：同一个视觉观测在 OpenVLA 里通常只对应一个 task-level instruction，而在 Steerable Policies 里，它优先对应的是与当前时间步对齐的 steering command。

## Steerable Policies 学的不是“任务名”，而是更细粒度的中间命令

如果把这个仓库和 OpenVLA 对照起来，最重要的区别可以归纳成下面这张表：

| 维度 | OpenVLA | `steerable-policies-bridge` |
| --- | --- | --- |
| 训练语言标签 | 以 task-level instruction 为主 | 优先替换为 step 对齐的 steering commands |
| 外部标注依赖 | 通常不要求额外分层命令标注 | 强依赖 `steering_features_bridge` 标注资产 |
| 低层接口粒度 | 任务级自然语言 | 子任务、动作风格、指向、轨迹等更细粒度命令 |
| 高层推理对低层的影响 | 间接，通常只能改任务表述 | 直接，高层可以显式发 steering command |
| 代码落点 | 通用 VLA 数据和训练骨架 | 在 OpenVLA 骨架上重写语言监督逻辑 |

这也是为什么论文会反复强调 “rich synthetic commands at various levels of abstraction”。从项目页给出的示例看，这些命令不只是 task-level commands，还包括 semantic subtasks、atomic motions、pointing，甚至带像素坐标的 gripper traces。

换句话说，OpenVLA 更像在学“这个任务大致该怎么做”；Steerable Policies 在试图学“如果我收到更细的中间命令，我能不能把它稳定地执行出来”。

## 这个仓库还多了一条 embodied reasoner 的训练路径

如果这里只是把 task label 换成 steering command，那它仍然可以被理解成“更细标签版 OpenVLA”。但源码里还有第二层变化：它显式支持一个 embodied reasoner 的训练路径。

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

这说明训练目标已经不只是“根据 instruction 预测低层动作”，而是“根据当前观察和任务，先组织出可解释的高层分解，再落到 command，最后落到 action”。

源码里对应的目标构造非常明确：

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

这条 reasoner 路径也不是隐藏开关，而是在训练配置里显式暴露出来：

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

这一步把 Steerable Policies 和普通 OpenVLA 分得更开了。它不是只在同一接口上换一种标签，而是在 OpenVLA 骨架上额外训练一种 `RATIONALE -> COMMAND -> ACTION` 的接口。

## 这些改动换来了什么能力

如果只看方法设计，Steerable Policies 至少换来了三件明确的能力：

1. 低层 policy 不再只能接一句笼统任务描述。  
   它可以学习执行更细粒度的中间命令。

2. 高层 reasoner 和低层 executor 的接口被显式建模。  
   高层不只输出任务名，还可以输出 steering command，甚至连 rationale 都能一起组织出来。

3. 同一个 OpenVLA 骨架可以被放进更明确的分层控制系统。  
   这也是 README 为什么不断把你往 `steerable-gym`、`reasoner_server.py`、`policy_server.py` 那条链路上引。

README 之所以不满足于让你跑 `robot/bridge/run_bridgev2_eval.py` 这种单模型 eval，原因就在这里：论文真正想展示的不是 task-to-action 的单模型闭环，而是三种高层控制方式如何驱动低层执行器：

- 人类直接发 steering commands
- 学到的 embodied reasoner 生成高层命令
- off-the-shelf VLM 通过 in-context learning 生成高层命令

这已经不是一个“本地起一个 policy checkpoint”能完整覆盖的系统了，而是一个多组件部署问题：

- 机器人侧负责相机、状态和动作执行
- policy 侧负责低层 action prediction
- reasoner 侧可以单独 host 一个高层 VLM
- `steerable-gym` 和 `AgentLace` 负责把这些组件串起来

## 代价和限制同样很具体

这套改法当然不是没有代价。它至少引入了三层明显耦合：

1. 对外部标注资产有强依赖。  
   你要复现的不只是模型训练，还包括一整套 steering annotation pipeline。

2. 对数据集和平台有明显绑定。  
   当前公开代码围绕 Bridge 数据组织，不是一个拿来就能迁到任意机器人平台的通用升级包。

3. 工程形态从单仓库训练，走向多组件控制系统。  
   你不只要管 policy checkpoint，还要管 reasoner、server-client 通信和在线控制链路。

所以 Steerable Policies 更像一个很具体的系统设计样本，而不是“OpenVLA 的通用下一代版本”。它提供的是一种判断：如果你想让高层 VLM 真正 steer 低层行为，就不该只盯着高层 prompt，更该先检查低层 policy 的输入接口是不是足够细。

## 这篇代码最值得带走的结论

把这篇文章压成一句话，就是：

**Steerable Policies 真正改的不是 OpenVLA 的 backbone，而是低层 policy 的 supervision contract。**

这件事为什么重要？因为它直接决定了高层推理能不能传到低层控制。如果低层 policy 只吃一句很粗的任务描述，那么高层模型就算能推理出更细的操作步骤，也很难稳定传递给执行器。Steerable Policies 给出的答案是：先把训练目标改成更细粒度的 steering commands，再进一步把 `RATIONALE -> COMMAND -> ACTION` 这条链也显式建模出来。

如果你已经在用 OpenVLA 或类似的 VLA，下一步不一定是先换更大的 backbone。更值得先问的往往是：

- 你的低层 policy 现在到底能接受什么粒度的指令？
- 高层模型除了输出 task description，还能不能输出可执行的中间命令？
- 训练数据里有没有把这些命令风格显式教给 policy？

Steerable Policies 的代码价值就在这里：它把一个本来容易停留在论文口号里的问题，变成了一个可以在数据变换、训练目标和部署链路里逐条检查的工程问题。

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
