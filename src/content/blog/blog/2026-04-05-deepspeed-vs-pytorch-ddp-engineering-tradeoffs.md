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

`PyTorch DDP` 在模型副本之间同步梯度；`DeepSpeed ZeRO` 则按阶段分片优化器状态、梯度和参数，减少每张卡上的重复存储。

下面比较两者的显存占用、训练循环和 checkpoint 管理。是否迁移，要看当前限制来自训练状态、通信，还是其他计算开销。

## 模型和训练状态都放得下时，DDP 通常已经足够

模型和完整训练状态能放下时，可以先用 `DDP` 建立多卡基线。

`DistributedDataParallel` 的工作方式是：每个 rank 持有一份完整模型副本，前向各算各的 batch，反向时做梯度同步，然后每个进程各自执行同样的 `optimizer.step()`。你看到的训练循环仍然是 PyTorch 原生那一套，没有额外引入一层更复杂的运行时。

保留原生训练循环便于：

- 调试路径更短，出问题时更容易定位是数据、模型还是通信。
- 和 PyTorch 原生生态贴得更紧，`sampler`、`autocast`、`checkpointing`、自定义 module 的接入都更直接。
- 团队协作成本更低，因为大多数人已经理解 `loss.backward()` 和 `optimizer.step()` 这条链路。

但 `DDP` 的代价也同样直接：它默认不帮你拆掉训练状态的冗余复制。

如果把模型参数记为 $P$，梯度记为 $G$，优化器状态记为 $O$，那在经典数据并行里，每个 rank 大体都要承担一整套：

$$
\text{Per-rank memory} \approx P + G + O + \text{activations}
$$

模型加载成功，不代表训练状态也能放下。优化器状态、梯度和混合精度副本可能使实际峰值显存超过容量。

还有一件事必须说清：`DDP` 也不负责替你切分输入数据。样本如何在各个 rank 之间分配，通常仍然要靠 `DistributedSampler` 这类组件来完成。`DDP` 的重点是同步，不是状态分片。

## DeepSpeed 主要改变的是训练状态的内存组织方式

这里重点讨论 `DeepSpeed` 的 `ZeRO`。它将数据并行中的重复状态分片，由不同 rank 保存：

- `ZeRO Stage 1`：先分 `optimizer states`
- `ZeRO Stage 2`：再分 `gradients`
- `ZeRO Stage 3`：连 `parameters` 也一起分

更高阶段减少更多常驻状态，同时需要相应的通信与调度。显存节省和吞吐变化要一起测量。

## ZeRO 为什么改变了数据并行的显存分配方式

下图比较完整复制与分片存储：

![DeepSpeed ZeRO memory usage comparison between classic data parallelism and ZeRO sharding](/images/deepspeed-zero-memory-comparison.png)

图中的状态分片可以减少重复存储；offload 还可将部分状态移到 `CPU` 或 `NVMe`。但图中标示的速度和成本收益不能直接套用到其他配置，需要检查：

- 你的模型规模是不是已经大到复制成本明显压过了别的成本。
- 机器间或卡间带宽是否足够支撑更复杂的通信。
- `ZeRO stage` 和 offload 配置是不是合理。
- 你的 workload 到底更卡显存、卡通信，还是卡算力。

当通信或 offload 成为瓶颈时，显存占用下降也可能伴随吞吐下降。

## 什么时候应该从 DDP 切到 DeepSpeed

先对照运行方式，再检查当前的资源限制。

| 维度 | PyTorch DDP | DeepSpeed |
| --- | --- | --- |
| 显存占用模型 | 每个 rank 默认持有完整模型副本和大部分训练状态 | 通过 ZeRO 分片 optimizer states、gradients、parameters |
| 启动与配置 | 更接近原生 PyTorch，配置面较小 | 通常需要额外 `deepspeed_config`，参数面更大 |
| 调试成本 | 相对更低，问题更容易沿训练循环排查 | 更高，问题可能出在分片、offload、通信或配置组合 |
| Checkpoint 管理 | 更直接，状态通常更接近单机 PyTorch 心智模型 | 需要理解分片状态如何保存、恢复和合并 |
| 大模型可训练性 | 很快受制于参数、梯度、优化器状态复制 | 更适合显存已经成为主瓶颈的场景 |
| 团队经验要求 | 会 PyTorch 分布式即可起步 | 需要能维护更复杂的训练运行时和配置体系 |

以下现象值得检查训练状态占用：

- 模型本身能加载，但一到 `optimizer.step()` 显存就炸。
- 你想把 global batch 再往上推一点，结果不是算力不够，而是状态放不下。
- 单靠梯度累积已经救不回来，因为参数和优化器状态复制占用已经太大。

确认主要开销来自状态复制后，再测试分片能减少多少显存，以及新增通信是否可接受。

## 从 DDP 迁移到 DeepSpeed 会增加哪些工程负担

下面两段是训练循环片段，用来对照状态由谁管理，不是独立可运行的脚本。`MyModel`、数据集、设备搬运函数和启动参数需由项目提供。先看 `DDP`：

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

这段循环显式处理了进程组、数据切分和优化器更新。`DeepSpeed` 则将前向、反向与更新交给 engine：

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

这段 DeepSpeed 片段只展示 engine 的调用顺序，多进程下仍需补充正确的数据分片。迁移后还要验证：

- 你要选哪一个 `ZeRO stage`。
- 要不要开 `offload_optimizer` 或 `offload_param`。
- checkpoint 是按什么格式保存，恢复时怎样对应回当前配置。
- 出现吞吐下降时，到底是通信、offload 还是 bucket 配置的问题。
- 某些自定义 module、hook、mixed precision 或 activation checkpointing 组合，会不会和当前配置互相打架。

这些配置决定运行时的行为，也会改变排障和恢复训练的方式。

## DDP 和 DeepSpeed 之间的中间方案

若主要开销来自优化器状态，可以评估 PyTorch 的 `ZeroRedundancyOptimizer`，而不必同时引入参数分片。它适用于：

- 模型和梯度还放得下。
- 真正开始膨胀的是 `Adam` 一类优化器状态。
- 你想先换回一部分显存，而不是立刻引入完整 `DeepSpeed` 运行时。

它主要处理优化器状态的冗余，不能代替梯度和参数分片。

## 用实测决定是否迁移

先记录当前配置在模型加载、反向传播和优化器更新时的峰值显存，以及每步耗时。激活占用、状态复制和通信拥塞需要不同的处理方式。

测试 ZeRO 时，同时验证保存与恢复训练，不能只看第一轮是否能启动。若使用 offload，还需测量 CPU 内存、存储和数据传输开销。最终选择应当满足显存预算，并保留可接受的吞吐与排障成本。

## 参考资料

- [PyTorch DistributedDataParallel 官方文档](https://docs.pytorch.org/docs/stable/generated/torch.nn.parallel.DistributedDataParallel.html)
- [PyTorch ZeroRedundancyOptimizer 教程](https://docs.pytorch.org/tutorials/recipes/zero_redundancy_optimizer.html)
- [DeepSpeed Training API 官方文档](https://deepspeed.readthedocs.io/en/stable/training.html)
- [DeepSpeed ZeRO 官方文档](https://deepspeed.readthedocs.io/en/stable/zero3.html)
