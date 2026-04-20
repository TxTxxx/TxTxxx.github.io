---
title: DeepSpeed vs PyTorch DDP：显存账本、工程复杂度与适用边界
date: 2026-04-05
summary: 从训练状态复制、ZeRO 分片、启动方式、checkpoint 到迁移成本，拆清 DeepSpeed 和原生 PyTorch DDP 在工程层面的差异与适用场景。
tags:
  - deepspeed
  - pytorch
  - ddp
  - distributed-training
  - llm-training
cover_image: /images/deepSpeed-cover.png
cover_alt: DeepSpeed logo on dark background
draft: false
---

# DeepSpeed vs PyTorch DDP：显存账本、工程复杂度与适用边界

`PyTorch DDP` 和 `DeepSpeed` 解决的不是同一层问题。`DDP` 主要解决多进程下如何稳定同步同一个训练步骤；`DeepSpeed` 则继续处理模型、梯度和优化器状态把显存吃满之后，训练还能不能继续扩展。

所以这两者不是简单的升级关系。很多场景里，`DDP` 已经足够；只有当训练状态复制本身开始成为瓶颈时，`DeepSpeed` 的价值才会变得明显。

## 模型和训练状态都放得下时，DDP 通常已经足够

先把结论摆前面：如果你的模型、激活、梯度和优化器状态都还放得下，优先用 `DDP` 通常是更稳的选择。

原因很朴素。`DistributedDataParallel` 的心智模型足够简单：每个 rank 持有一份完整模型副本，前向各算各的 batch，反向时做梯度同步，然后每个进程各自执行同样的 `optimizer.step()`。你看到的训练循环仍然是 PyTorch 原生那一套，没有额外引入一层更复杂的运行时。

这会带来几个很实在的好处：

- 调试路径更短，出问题时更容易定位是数据、模型还是通信。
- 和 PyTorch 原生生态贴得更紧，`sampler`、`autocast`、`checkpointing`、自定义 module 的接入都更直接。
- 团队协作成本更低，因为大多数人已经理解 `loss.backward()` 和 `optimizer.step()` 这条链路。

但 `DDP` 的代价也同样直接：它默认不帮你拆掉训练状态的冗余复制。

如果把模型参数记为 $P$，梯度记为 $G$，优化器状态记为 $O$，那在经典数据并行里，每个 rank 大体都要承担一整套：

$$
\text{Per-rank memory} \approx P + G + O + \text{activations}
$$

这正是 `DDP` 在大模型训练里最容易撞墙的地方。模型本身也许勉强能放下，但 `Adam` 一类优化器的状态、梯度缓冲区和混合精度副本一叠上来，显存压力马上会从“可以训练”变成“根本起不来”。

还有一件事必须说清：`DDP` 也不负责替你切分输入数据。样本如何在各个 rank 之间分配，通常仍然要靠 `DistributedSampler` 这类组件来完成。`DDP` 的重点是同步，不是状态分片。

## DeepSpeed 主要改变的是训练状态的内存组织方式

`DeepSpeed` 容易被误解成“换个命令启动训练”。这当然是它的一部分，但不是它的核心价值。它真正重写的是训练状态的组织方式，也就是那本最重要的账：**哪些东西必须在每张卡上都复制一份，哪些东西其实可以拆开来存。**

这也是 `ZeRO` 的出发点。它不是重新发明数据并行，而是针对经典数据并行里最浪费显存的那部分冗余做分片。

官方文档给出的三阶段可以压缩成下面三句话：

- `ZeRO Stage 1`：先分 `optimizer states`
- `ZeRO Stage 2`：再分 `gradients`
- `ZeRO Stage 3`：连 `parameters` 也一起分

也就是说，`DDP` 的默认思路是“每个 rank 都保留整套训练状态”，而 `ZeRO` 的思路是“只要通信和调度能兜住，就尽量别让每个 rank 都背整套包袱”。

把它写成更直白一点的工程语言：

- `DDP` 优先保证实现直接、行为透明。
- `DeepSpeed ZeRO` 优先减少冗余状态占用，把显存换回来。

这也是为什么很多人上 `DeepSpeed` 之后，最明显的感受不是“代码少了”，而是“终于能把原来放不下的模型或 batch 跑起来了”。

## ZeRO 为什么改变了数据并行的显存分配方式

下面这张图很适合拿来解释 `ZeRO` 的核心直觉：

![DeepSpeed ZeRO memory usage comparison between classic data parallelism and ZeRO sharding](/images/deepspeed-zero-memory-comparison.png)

这张图最有价值的地方，不是右边那些“更快、更便宜”的宣传口号，而是中间那一下非常直观的变化：传统数据并行会把大部分训练状态复制到每个 `GPU`，而 `ZeRO` 通过分片把这部分冗余拆掉。

这就是 `DeepSpeed` 和 `DDP` 最根上的分歧。`DDP` 假设复制是默认代价，重点在高效同步；`ZeRO` 假设复制本身已经变成瓶颈，于是开始认真计算：哪些状态真的需要本地常驻，哪些可以按 rank 拆账，哪些甚至可以继续 offload 到 `CPU` 或 `NVMe`。

这里必须泼一点冷水。图上的 `Scale`、`Speed`、`Cost` 这些收益不是默认自动到账的。它们依赖至少四件事：

- 你的模型规模是不是已经大到复制成本明显压过了别的成本。
- 机器间或卡间带宽是否足够支撑更复杂的通信。
- `ZeRO stage` 和 offload 配置是不是合理。
- 你的 workload 到底更卡显存、卡通信，还是卡算力。

如果这些条件不成立，`DeepSpeed` 也可能只是把系统变复杂，并没有把训练变轻松。

## 什么时候应该从 DDP 切到 DeepSpeed

这两个方案真正该怎么选，不要从“哪个更流行”开始问，要从“你现在到底卡在哪”开始问。

| 维度 | PyTorch DDP | DeepSpeed |
| --- | --- | --- |
| 显存占用模型 | 每个 rank 默认持有完整模型副本和大部分训练状态 | 通过 ZeRO 分片 optimizer states、gradients、parameters |
| 启动与配置 | 更接近原生 PyTorch，配置面较小 | 通常需要额外 `deepspeed_config`，参数面更大 |
| 调试成本 | 相对更低，问题更容易沿训练循环排查 | 更高，问题可能出在分片、offload、通信或配置组合 |
| Checkpoint 管理 | 更直接，状态通常更接近单机 PyTorch 心智模型 | 需要理解分片状态如何保存、恢复和合并 |
| 大模型可训练性 | 很快受制于参数、梯度、优化器状态复制 | 更适合显存已经成为主瓶颈的场景 |
| 团队经验要求 | 会 PyTorch 分布式即可起步 | 需要能维护更复杂的训练运行时和配置体系 |

真正的分水岭一般不是“你想不想追新”，而是下面这种时刻：

- 模型本身能加载，但一到 `optimizer.step()` 显存就炸。
- 你想把 global batch 再往上推一点，结果不是算力不够，而是状态放不下。
- 单靠梯度累积已经救不回来，因为参数和优化器状态复制占用已经太大。

一旦瓶颈落在这里，`DDP` 的透明和简单就开始不够用了。你需要的是更激进的状态管理，而这正是 `DeepSpeed` 的价值区间。

## 从 DDP 迁移到 DeepSpeed 会增加哪些工程负担

很多教程喜欢把迁移讲得很轻松，因为从训练 loop 的表面看，改动确实没有大到离谱。

先看 `DDP`。下面这段代码只保留分布式训练里最关键的骨架，同时把每一步到底负责什么写进注释里：

```python
import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, DistributedSampler

# 初始化默认进程组，让所有 rank 能参与同一套 collective 通信。
dist.init_process_group("nccl")
# 当前进程绑定到自己的本地 GPU。
torch.cuda.set_device(local_rank)

# 模型先搬到本地设备，再交给 DDP 包装。
model = MyModel().to(local_rank)
model = DDP(model, device_ids=[local_rank])

# DDP 不负责自动切数据，数据切分还是要靠 DistributedSampler。
sampler = DistributedSampler(dataset, shuffle=True)
loader = DataLoader(dataset, batch_size=batch_size, sampler=sampler)
optimizer = torch.optim.AdamW(model.parameters(), lr=lr)

for epoch in range(num_epochs):
    # 每个 epoch 刷新 sampler 的随机种子，避免各 rank 读到相同顺序。
    sampler.set_epoch(epoch)
    for batch in loader:
        batch = move_to_device(batch, local_rank)
        optimizer.zero_grad()
        # 前向基本还是普通 PyTorch，DDP 的关键动作主要发生在 backward。
        loss = model(**batch)
        # backward() 中会触发梯度同步。
        loss.backward()
        # 每个 rank 本地执行同样的优化器 step，参数因此继续保持一致。
        optimizer.step()
```

这段代码最容易被忽略的一点是：它虽然是多卡训练，但大部分代码依然贴着原生 PyTorch 的心智模型。你能很清楚地看见通信初始化、数据切分、反向传播和优化器更新分别落在哪。

再看 `DeepSpeed`。表面上它只是把训练入口换成了 `engine`，但这个 `engine` 恰好是后面所有分片、offload 和状态管理的入口：

```python
import deepspeed
import torch
from torch.utils.data import DataLoader

# 模型和优化器依旧按 PyTorch 方式定义。
model = MyModel()
optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

# 这里会根据 deepspeed_config.json 创建 DeepSpeedEngine。
# 之后前向、反向和 step 都交给这个运行时对象接管。
model_engine, optimizer, _, _ = deepspeed.initialize(
    model=model,
    optimizer=optimizer,
    model_parameters=model.parameters(),
    config="deepspeed_config.json",
)

for batch in loader:
    # 使用 engine 持有的 local_rank，而不是手写 DDP 包装层里的 rank。
    batch = move_to_device(batch, model_engine.local_rank)
    # 前向已经不再是裸 model，而是交给 DeepSpeed runtime 执行。
    loss = model_engine(**batch)
    # backward/step 里可能包含 ZeRO 分片通信、梯度管理和 offload 行为。
    model_engine.backward(loss)
    model_engine.step()
```

如果只看这两段代码，确实很容易得出一个错觉：`DeepSpeed` 好像只是把 `loss.backward()` 和 `optimizer.step()` 改叫了别的名字。真正的区别其实是：`DDP` 主要在同步完整副本之间的梯度，而 `DeepSpeed` 运行时会进一步决定参数、梯度和优化器状态是不是要分片、什么时候通信、要不要 offload 到别的存储层。

真正的工程负担其实不在这几行，而在下面这些地方：

- 你要选哪一个 `ZeRO stage`。
- 要不要开 `offload_optimizer` 或 `offload_param`。
- checkpoint 是按什么格式保存，恢复时怎样对应回当前配置。
- 出现吞吐下降时，到底是通信、offload 还是 bucket 配置的问题。
- 某些自定义 module、hook、mixed precision 或 activation checkpointing 组合，会不会和当前配置互相打架。

所以迁移的真实成本不是“改 API”，而是“你要不要接手一套更复杂的训练运行时”。

## DDP 和 DeepSpeed 之间的中间方案

这也是工程上很常见的一种状态：你已经感觉到 `DDP` 开始吃力，但团队又不想立刻把整个训练栈迁到 `DeepSpeed`。

这时候可以先看一眼 PyTorch 自己提供的 `ZeroRedundancyOptimizer`。它借用了 `ZeRO` 的核心思想，但还留在更接近原生 PyTorch 的使用体验里。它主要解决的是 optimizer state 的冗余复制问题，适合下面这种情况：

- 模型和梯度还放得下。
- 真正开始膨胀的是 `Adam` 一类优化器状态。
- 你想先换回一部分显存，而不是立刻引入完整 `DeepSpeed` 运行时。

它不是 `DeepSpeed` 的完全替代品，因为它不等于把 `ZeRO Stage 1/2/3` 全套搬进来。但在“系统复杂度”和“显存回收”之间，它是一个很实用的中间台阶。

## 选型前应该先确认哪些瓶颈

如果只允许我把这篇文章压成四条建议，那会是下面这四条：

1. 模型还放得下，训练脚本还在快速迭代，优先用 `DDP`。  
   这时候最贵的资源往往不是显存，而是排障时间和团队认知负担。

2. 先卡住的是 optimizer states，而不是参数本体，先考虑 `ZeroRedundancyOptimizer`。  
   它经常是比“全面迁移到 DeepSpeed”更便宜的一步。

3. 参数、梯度、优化器状态的复制已经让你根本起不来训练，再去看 `DeepSpeed ZeRO`。  
   这是它最值得被引入的场景，不是“为了显得更专业”，而是因为你别无选择。

4. 如果必须靠 `CPU` 或 `NVMe` offload 才能把训练跑起来，就接受一个现实：  
   你已经不在“简单训练栈”的世界里了，接下来的问题更多会是系统工程问题，而不是几行模型代码问题。

`DeepSpeed` 和 `DDP` 分别适合不同的工程压力区间。`DDP` 更适合简单、透明、可维护的多卡训练；`DeepSpeed` 更适合显存和规模先成为主限制的场景。

选型前最重要的不是先站队，而是先定位瓶颈：到底是模型状态复制、通信带宽、吞吐稳定性，还是团队根本没有余力维护更复杂的训练栈。

## 参考资料

- [PyTorch DistributedDataParallel 官方文档](https://docs.pytorch.org/docs/stable/generated/torch.nn.parallel.DistributedDataParallel.html)
- [PyTorch ZeroRedundancyOptimizer 教程](https://docs.pytorch.org/tutorials/recipes/zero_redundancy_optimizer.html)
- [DeepSpeed Training API 官方文档](https://deepspeed.readthedocs.io/en/stable/training.html)
- [DeepSpeed ZeRO 官方文档](https://deepspeed.readthedocs.io/en/stable/zero3.html)
