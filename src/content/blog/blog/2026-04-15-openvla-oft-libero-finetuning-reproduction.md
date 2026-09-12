---
title: OpenVLA 与 OpenVLA-OFT 在 LIBERO 上的微调复现：三种策略、学习率与 LoRA rank
date: 2026-04-15
summary: 在 LIBERO 上复现原版 OpenVLA、OpenVLA+PD&AC 和 OpenVLA+PD&AC+ContL1，统一只训练 30000 step，先分析三种策略的差异与结果，再比较学习率和 LoRA rank 对收敛的影响。
tags:
  - openvla
  - openvla-oft
  - robotics
  - finetuning
  - libero
category: embodied-ai
cover_image: /images/openvla-reproduce-cover.jpg
cover_alt: Overview of LIBERO-Spatial, LIBERO-Object, LIBERO-Goal, and LIBERO-Long benchmark tasks
draft: false
---

# OpenVLA 与 OpenVLA-OFT 在 LIBERO 上的微调复现：三种策略、学习率与 LoRA rank

我把三条路线都放在 `LIBERO spatial no noops` 上跑了一遍：原版 `OpenVLA`、`OpenVLA + PD&AC`、`OpenVLA + PD&AC + ContL1`。所有实验统一只训练 `30000 step`，因此这里比较的是同一预算下各条路线跑到了什么位置，而不是充分收敛后的最终上限。

三条路线的训练目标不同。原版 OpenVLA 还是离散动作 token 训练；`PD&AC` 改成并行 `action chunk` 预测；`PD&AC + ContL1` 则进一步改成连续动作回归。

这意味着训练面板里的指标不能直接横向比较，推理延迟也会因为 `action_chunk_len` 的变化一起改变。后面的结果都基于这个前提来解释。

## 三种微调策略在动作表示和解码方式上的差异

原版 `OpenVLA` 的动作输出仍然是离散 token。训练面板里最稳定出现的是 `train_loss`、`l1_loss` 和 `action_accuracy`，推理 benchmark 里 `action_chunk_len=1`，也就是一次只预测一段长度为 1 的动作输出。

`OpenVLA + PD&AC` 之后，动作生成路径先发生了结构变化。它使用 parallel decoding 和 `action chunk` 预测，一次前向直接读出一个 chunk 的动作，但动作本身仍然是离散建模。因此训练面板会变成 `Next Actions Accuracy`、`Curr Action Accuracy`、`Next Actions L1 Loss`、`Curr Action L1 Loss` 这一类 chunk 级指标。

`OpenVLA + PD&AC + ContL1` 再往前走了一步：保留 parallel decoding 和 `action chunk`，但把动作头改成连续动作回归，训练重点从离散 token 正确率转向连续动作误差。因此这条路线最核心的指标不再是 accuracy，而是 `Next Actions L1 Loss`、`Curr Action L1 Loss` 和总 `Loss`。

## 三种微调策略各自复现出了什么结果

先看原版 `OpenVLA`。我这里选 `lr=5e-4` 这一组作为代表图，因为它在这次实验里给出了更高的末尾 `action_accuracy`。

![原版 OpenVLA 在 LIBERO 上的微调曲线](/images/openvla_reproduce/ft+openvla-7b+libero_spatial_no_noops+b18+lr-0.0005+lora-r32+dropout-0.0--image_aug.png)

这组结果的末尾指标大致是：

- `train_loss ≈ 0.25364`
- `l1_loss ≈ 0.00722`
- `action_accuracy ≈ 0.92857`

这次运行中，训练集上的 `action_accuracy` 最后约为 `0.93`。它描述动作 token 的预测情况，不等同于任务成功率。

再看 `OpenVLA + PD&AC`。这张图对应的是并行 `action chunk` 预测，但动作仍然走离散 next-token 路线。

![OpenVLA 加入 PD&AC 后的训练面板](/images/openvla_reproduce/ft+openvla-7b-finetuned-libero-spatial+libero_spatial_no_noops+b20+lr-0.0005+lora-r32+dropout-0.0--image_aug--parallel_dec--8chunk--discrete_acts--next_token--1img.png)

这组结果在末尾大致是：

- `Next Actions L1 Loss ≈ 0.01435`
- `Next Actions Accuracy ≈ 0.75918`
- `Curr Action L1 Loss ≈ 0.02649`
- `Curr Action Accuracy ≈ 0.74286`

这里分别记录 chunk 中的当前动作和未来动作指标，不能直接用它们与原版单步 `action_accuracy` 的差值判断策略优劣。

最后看 `OpenVLA + PD&AC + ContL1`。这条路线保留 `PD&AC` 的并行 chunk 预测，但把动作头改成了连续动作 L1 回归。

![OpenVLA 加入 PD&AC 与 ContL1 后的训练面板](/images/openvla_reproduce/ft+openvla-7b-finetuned-libero-spatial+libero_spatial_no_noops+b18+lr-0.0005+lora-r32+dropout-0.0--image_aug--parallel_dec--8chunk--continuous_acts--L1_regression--1img.png)

这组结果的末尾指标大致是：

- `Next Actions L1 Loss ≈ 0.03125`
- `Loss ≈ 0.03149`
- `Curr Action L1 Loss ≈ 0.03369`

这些是 `30000 step` 时的训练指标。它们还不足以比较各路线充分训练后的表现；连续动作头也没有可以直接对照的 token accuracy。下面的学习率和 rank 对比都放在同一种训练目标内进行。

## 学习率如何影响原版 OpenVLA 的收敛指标

在原版 `OpenVLA` 上，我只改了学习率，其余设置保持一致：同样的数据、同样的 `LoRA rank=32`、同样的 batch 设定，而且同样只训练 `30000 step`。对比的是 `lr=3e-4` 和 `lr=5e-4`。

![原版 OpenVLA，学习率 3e-4 的训练曲线](/images/openvla_reproduce/ft+openvla-7b+libero_spatial_no_noops+b18+lr-0.0003+lora-r32+dropout-0.0--image_aug.png)

`lr=3e-4` 的末尾指标大致是：

- `train_loss ≈ 0.17215`
- `l1_loss ≈ 0.01077`
- `action_accuracy ≈ 0.92063`

![原版 OpenVLA，学习率 5e-4 的训练曲线](/images/openvla_reproduce/ft+openvla-7b+libero_spatial_no_noops+b18+lr-0.0005+lora-r32+dropout-0.0--image_aug.png)

`lr=5e-4` 的末尾指标大致是：

- `train_loss ≈ 0.25364`
- `l1_loss ≈ 0.00722`
- `action_accuracy ≈ 0.92857`

如果只看 `l1_loss` 和 `action_accuracy`，`5e-4` 这一组更好；如果只看 `train_loss`，则是 `3e-4` 更低。这说明在原版 OpenVLA 里，学习率不只是改变收敛快慢，还会改变不同指标之间的平衡。

因此，仅按总 `train_loss` 选 checkpoint，会与按动作误差选择得到不同判断。这里还缺少闭环评估，暂时不能说哪个学习率对应的策略更好。

## LoRA rank 如何影响 PD&AC + ContL1 的连续动作误差

第二组控制变量实验放在 `PD&AC + ContL1` 上。我固定了训练方法、数据设置和学习率 `5e-4`，同样统一训练 `30000 step`，只比较 `LoRA rank=16` 和 `LoRA rank=32`。

![PD&AC 加 ContL1，LoRA rank 16 的训练曲线](/images/openvla_reproduce/ft+openvla-7b-finetuned-libero-spatial+libero_spatial_no_noops+b18+lr-0.0005+lora-r16+dropout-0.0--image_aug--parallel_dec--8chunk--continuous_acts--L1_regression--1img.png)

`rank=16` 的末尾指标大致是：

- `Next Actions L1 Loss ≈ 0.03735`
- `Loss ≈ 0.03784`
- `Curr Action L1 Loss ≈ 0.04053`

![PD&AC 加 ContL1，LoRA rank 32 的训练曲线](/images/openvla_reproduce/ft+openvla-7b-finetuned-libero-spatial+libero_spatial_no_noops+b18+lr-0.0005+lora-r32+dropout-0.0--image_aug--parallel_dec--8chunk--continuous_acts--L1_regression--1img.png)

`rank=32` 的末尾指标大致是：

- `Next Actions L1 Loss ≈ 0.03125`
- `Loss ≈ 0.03149`
- `Curr Action L1 Loss ≈ 0.03369`

这次记录的末尾数值中，`rank=32` 的三项误差都低于 `rank=16`。目前没有多随机种子重复实验，不能据此判断差异的稳定性，也不能把这个排序直接推广到其他任务。

## 三种策略的速度差异主要来自 action chunk 并行预测

除了训练曲线，我还对三种策略各跑了一次推理 benchmark，同时记录每次调用输出的动作数和延迟。

先看原版 `OpenVLA`。

![原版 OpenVLA 的推理 benchmark 结果](/images/openvla_reproduce/openvla-normal.png)

这组 benchmark 里：

- `action_chunk_len = 1`
- `mean_latency_ms ≈ 199.39`
- `p50_latency_ms ≈ 199.20`
- `p95_latency_ms ≈ 202.26`
- `p99_latency_ms ≈ 205.47`

再看 `OpenVLA + PD&AC`。

![OpenVLA 加入 PD&AC 后的推理 benchmark 结果](/images/openvla_reproduce/openvla+PD&AC.png)

这组 benchmark 里：

- `action_chunk_len = 8`
- `mean_latency_ms ≈ 57.10`
- `p50_latency_ms ≈ 57.02`
- `p95_latency_ms ≈ 58.53`
- `effective_action_hz ≈ 140.10`

最后是 `OpenVLA + PD&AC + ContL1`。

![OpenVLA 加入 PD&AC 与 ContL1 后的推理 benchmark 结果](/images/openvla_reproduce/openvla+PD&AC+Cont-L1.png)

这组 benchmark 里：

- `action_chunk_len = 8`
- `mean_latency_ms ≈ 56.48`
- `p50_latency_ms ≈ 56.46`
- `p95_latency_ms ≈ 57.45`
- `effective_action_hz ≈ 141.64`

这次 benchmark 中，原版 OpenVLA 的平均延迟约 `199ms`，两种并行 chunk 配置约 `56-57ms`，每次输出 `8` 个动作。两种并行配置的延迟接近，切换到 ContL1 没有在这次测量中带来明显变化。`effective_action_hz` 按输出动作数和耗时计算，不代表包含观测、通信与执行开销后的机器人实际控制频率。

## 还缺少闭环评估

这次记录能比较同一训练目标下的学习率、rank，以及不同解码方式的推理耗时。它还不能回答哪种策略完成任务的成功率更高。后续需要在一致的评估条件下测试闭环表现，并补充训练预算和随机种子的对照，才能判断训练指标中的差异是否延续到控制结果。
