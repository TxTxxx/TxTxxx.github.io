---
title: OpenVLA 与 OpenVLA-OFT 在 LIBERO 上的微调复现：30000 Step 下三种策略的差异
date: 2026-04-15
summary: 在 LIBERO 上复现原版 OpenVLA、OpenVLA+PD&AC 和 OpenVLA+PD&AC+ContL1，统一只训练 30000 step，先分析三种策略的差异与结果，再比较学习率和 LoRA rank 对收敛的影响。
tags:
  - openvla
  - openvla-oft
  - robotics
  - finetuning
  - libero
featured_slot: 2
cover_image: /images/openvla-reproduce-cover.jpg
cover_alt: Overview of LIBERO-Spatial, LIBERO-Object, LIBERO-Goal, and LIBERO-Long benchmark tasks
draft: false
---

# OpenVLA 和 OpenVLA-OFT 风格微调的差别，不只在超参数上

我把三条路线都在 `LIBERO spatial no noops` 上跑了一遍：原版 `OpenVLA`、`OpenVLA + PD&AC`、`OpenVLA + PD&AC + ContL1`。所有微调实验都统一只跑了 `30000 step`(算力和资金都有限)。因此，这篇文章讨论的是同一预算下三种策略各自跑到了什么位置，而不是它们在充分收敛后的最终上限。

这次复现里，最先需要说清的不是哪条曲线更低，而是三种策略优化的目标本来就不同。原版 OpenVLA 仍然沿着离散动作 token 做训练；`PD&AC` 把动作输出改成并行 `action chunk` 预测；`PD&AC + ContL1` 则在并行预测的基础上继续把动作头改成连续动作回归。

这会直接影响两件事。第一，训练面板里出现的指标已经不是同一种量，不能拿一个 `accuracy` 或一个 `loss` 横向定输赢。第二，推理 benchmark 的延迟也会跟着变化，因为 `action_chunk_len` 从原版的 1 变成了 8。这篇文章按这个顺序展开：先看三种策略本身的区别和复现结果，再看学习率与 LoRA rank 这两组参数实验。

## 三种微调策略的区别，先看动作表示和解码方式

原版 `OpenVLA` 的动作输出仍然是离散 token。训练面板里最稳定出现的是 `train_loss`、`l1_loss` 和 `action_accuracy`，推理 benchmark 里 `action_chunk_len=1`，也就是一次只预测一段长度为 1 的动作输出。

`OpenVLA + PD&AC` 之后，动作生成路径先发生了结构变化。它使用 parallel decoding 和 `action chunk` 预测，一次前向直接读出一个 chunk 的动作，但动作本身仍然是离散建模。因此训练面板会变成 `Next Actions Accuracy`、`Curr Action Accuracy`、`Next Actions L1 Loss`、`Curr Action L1 Loss` 这一类 chunk 级指标。

`OpenVLA + PD&AC + ContL1` 再往前走了一步：保留 parallel decoding 和 `action chunk`，但把动作头改成连续动作回归，训练重点从离散 token 正确率转向连续动作误差。因此这条路线最核心的指标不再是 accuracy，而是 `Next Actions L1 Loss`、`Curr Action L1 Loss` 和总 `Loss`。

这一步必须先说清。因为后面你会看到，三条路线都能收敛，但它们收敛到的不是同一个目标。原版 `OpenVLA` 的 `action_accuracy`，和 `PD&AC` 面板里的 `Curr Action Accuracy`，以及 `PD&AC + ContL1` 里的 L1 误差，本来就不能当作同一种信号解释。

## 三种策略分别复现出了什么结果

先看原版 `OpenVLA`。我这里选 `lr=5e-4` 这一组作为代表图，因为它在这次实验里给出了更高的末尾 `action_accuracy`。

![原版 OpenVLA 在 LIBERO 上的微调曲线](/images/openvla_reproduce/ft+openvla-7b+libero_spatial_no_noops+b18+lr-0.0005+lora-r32+dropout-0.0--image_aug.png)

这组结果的末尾指标大致是：

- `train_loss ≈ 0.25364`
- `l1_loss ≈ 0.00722`
- `action_accuracy ≈ 0.92857`

从这张图可以先确认一件事：原版 OpenVLA 这条离散动作路线，在当前数据和 `30000 step` 的预算下是能稳定收敛的，而且 `action_accuracy` 最后可以到 `0.93` 左右。

再看 `OpenVLA + PD&AC`。这张图对应的是并行 `action chunk` 预测，但动作仍然走离散 next-token 路线。

![OpenVLA 加入 PD&AC 后的训练面板](/images/openvla_reproduce/ft+openvla-7b-finetuned-libero-spatial+libero_spatial_no_noops+b20+lr-0.0005+lora-r32+dropout-0.0--image_aug--parallel_dec--8chunk--discrete_acts--next_token--1img.png)

这组结果在末尾大致是：

- `Next Actions L1 Loss ≈ 0.01435`
- `Next Actions Accuracy ≈ 0.75918`
- `Curr Action L1 Loss ≈ 0.02649`
- `Curr Action Accuracy ≈ 0.74286`

这里最值得注意的是指标定义已经变了。它不再对应原版 OpenVLA 的单步动作 token 输出，而是 chunk 级的当前动作和未来动作预测。因此这组图的含义不是“accuracy 下降了”，而是“训练目标已经换成了并行 chunk 预测下的离散动作建模”。同时也要补一句限制：这条路线同样只跑了 `30000 step`，对 OpenVLA-OFT 这一类并行动作预测方法来说，这个训练长度还明显不够长。

最后看 `OpenVLA + PD&AC + ContL1`。这条路线保留 `PD&AC` 的并行 chunk 预测，但把动作头改成了连续动作 L1 回归。

![OpenVLA 加入 PD&AC 与 ContL1 后的训练面板](/images/openvla_reproduce/ft+openvla-7b-finetuned-libero-spatial+libero_spatial_no_noops+b18+lr-0.0005+lora-r32+dropout-0.0--image_aug--parallel_dec--8chunk--continuous_acts--L1_regression--1img.png)

这组结果的末尾指标大致是：

- `Next Actions L1 Loss ≈ 0.03125`
- `Loss ≈ 0.03149`
- `Curr Action L1 Loss ≈ 0.03369`

因此，三种策略的复现结果可以先总结成一句话：它们都能开始收敛，但原版 OpenVLA 在优化离散动作 token，`PD&AC` 在优化并行 chunk 下的离散动作预测，`PD&AC + ContL1` 在优化并行 chunk 下的连续动作误差。这也是后面所有参数分析的前提。这里还要加一个直接结论：在统一只跑 `30000 step` 的前提下，OpenVLA-OFT 相关路线还没有达到充分收敛，所以它们的动作准确率不会和普通版 OpenVLA 一样高。

## 原版 OpenVLA 中，学习率会改变最终指标的平衡

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

就这组实验而言，可以下一个比较明确的结论：`5e-4` 没有把训练跑坏，反而把末尾 `l1_loss` 和 `action_accuracy` 再往上推了一点；但它也把总 `train_loss` 保持在更高的位置。复现原版 OpenVLA 时，如果只跑一个学习率，很容易把结论下得过早。

## 在 PD&AC + ContL1 里，LoRA rank 会直接影响连续动作误差

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

这组结果比学习率对比更直接。`rank=32` 在三项连续动作误差指标上都优于 `rank=16`，而且差距不是单点抖动的量级。在当前这组 `LIBERO` 复现实验里，较低的 LoRA rank 没能保持和 `r32` 相同的收敛水平。

这个结论不应该直接外推到所有任务和所有模型规模，但至少说明两件事：如果你跑的是 `PD&AC + ContL1` 这条连续动作头路线，LoRA rank 不适合默认取一个偏小的值然后不再对比；同时在 `30000 step` 的预算下，这条路线还没有表现出已经完全收敛的迹象。

## 三种策略的速度差异，主因是 action chunk 并行预测

除了训练曲线，我还对三种策略各跑了一次推理 benchmark。这里最重要的不是单个小数点，而是 `action_chunk_len` 和平均延迟之间的关系。

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

速度结果非常明确。原版 OpenVLA 的平均延迟约为 `199ms`，而 `PD&AC` 和 `PD&AC + ContL1` 都降到了 `56-57ms` 左右。这里的主要变化不是损失函数，而是一次前向直接预测 `8` 个动作的并行 `action chunk` 路线。`PD&AC` 与 `PD&AC + ContL1` 的延迟几乎一致，也说明 ContL1 主要改变的是动作建模方式，而不是推理吞吐本身。

## 这次复现能先确认三件事

第一，原版 `OpenVLA`、`PD&AC` 和 `PD&AC + ContL1` 的差别首先是方法结构不同，具体体现在动作表示、解码方式和训练目标上，而不是只改了一个超参数。

第二，在原版 `OpenVLA` 里，学习率会改变最终指标组合。当前实验中，`5e-4` 给出了更好的 `l1_loss` 和 `action_accuracy`，但 `3e-4` 的总 `train_loss` 更低。

第三，这篇文章里的所有微调实验都只训练了 `30000 step`。在这个预算下，原版 OpenVLA 已经能把动作准确率推到更高的位置，而 OpenVLA-OFT 相关路线还没有达到充分收敛，因此动作准确率会不如普通版 OpenVLA。如果你的关注点同时包括控制频率，那么并行 `action chunk` 预测带来的系统收益仍然足够明显，平均延迟从约 `199ms` 降到了约 `56ms`。
