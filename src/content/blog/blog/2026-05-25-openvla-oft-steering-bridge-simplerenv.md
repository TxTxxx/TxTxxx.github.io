---
title: OpenVLA / OFT / Steering：一个 2×2 实验告诉你什么
date: 2026-05-25
summary: 用 2×2 消融实验比较 task-level instruction 与 steering commands、OpenVLA 离散自回归与 OFT 连续并行预测，并分析 OpenVLA 在 Bridge V2 上 loss 很低但闭环成功率不占优的原因。
tags:
  - openvla
  - openvla-oft
  - steerable-policies
  - robotics
  - simplerenv
cover_image: /images/openvla-oft-steerable-experiment/openvla-oft-steering-2x2-cover.png
featured_slot: 1
cover_alt: OpenVLA, OFT, and Steering 2x2 experiment cover explaining language-side and action-side ablations
draft: false
---

# OpenVLA / OFT / Steering：一个 2×2 实验告诉你什么

本文验证一个具体问题：当 [OpenVLA](https://arxiv.org/abs/2406.09246) 的动作输出已经换成 [OpenVLA-OFT](https://arxiv.org/abs/2502.19645) 的连续并行预测后，[Steerable Policies](https://arxiv.org/abs/2602.13193) 风格的细粒度 `steering commands` 是否还能带来额外成功率提升。实验在 Bridge V2 上微调，在 SimplerEnv 中评估 4 个 WidowX 任务。

Steerable Policies 这项工作的核心不是换一个更大的 VLA backbone，而是改低层 policy 的语言接口。原始 OpenVLA 通常接收 task-level instruction，例如 “put the eggplant in the basket”；Steerable Policies 则希望低层策略能接收更细粒度的中间命令，例如当前阶段该靠近哪个物体、移动到哪个区域、如何对齐抓取或放置。这样做的目标是让高层 VLM 或 embodied reasoner 不只输出一个粗任务名，而是能把分解后的控制意图传给低层动作策略。

这也带来一个自然问题：如果动作端本身已经被 OpenVLA-OFT 改强了，语言端继续换成 steering commands 还有没有必要？本文的 2×2 实验就是围绕这个问题设计的。

## 4 组微调模型已经开源

为了方便复现和后续对比，这次实验对应的 4 个 checkpoint 都已经放到 Hugging Face。它们正好对应后文的 A/B/C/D 四组设置：

![Hugging Face checkpoints for the OpenVLA, OpenVLA-OFT, and steering command experiments](/images/openvla-oft-steerable-experiment/huggingface-openvla-checkpoints.png)

| 组别 | Hugging Face checkpoint | 对应设置 |
| --- | --- | --- |
| A | [`TxTxx/openvla-bridgev2-refinetuned`](https://huggingface.co/TxTxx/openvla-bridgev2-refinetuned) | task-level instruction + OpenVLA 离散自回归 |
| B | [`TxTxx/openvla-steerable-bridgev2`](https://huggingface.co/TxTxx/openvla-steerable-bridgev2) | steering commands + OpenVLA 离散自回归 |
| C | [`TxTxx/openvla-oft-bridgev2`](https://huggingface.co/TxTxx/openvla-oft-bridgev2) | task-level instruction + OFT 连续并行预测 |
| D | [`TxTxx/openvla-oft-steerable-bridgev2`](https://huggingface.co/TxTxx/openvla-oft-steerable-bridgev2) | steering commands + OFT 连续并行预测 |

这几个模型不是额外的展示材料，而是本文实验设计的一部分。后面的成功率、训练 loss 和失败模式分析，都围绕这 4 个 checkpoint 展开。

## 实验设计把语言端和动作端拆开

这组实验是一个 2×2 设计。第一个维度是语言输入：使用原始 `task-level instruction`，还是使用 Steerable Policies 风格的细粒度 `steering commands`。第二个维度是动作输出：使用原版 OpenVLA 的离散自回归动作 token，还是使用 OpenVLA-OFT 的连续并行动作预测。

四组模型如下：

| 组别 | 语言输入 | 动作输出 | 这组实验回答的问题 |
| --- | --- | --- | --- |
| A | task-level instruction | OpenVLA 离散自回归 | 原始 OpenVLA 微调基线 |
| B | steering commands | OpenVLA 离散自回归 | 只改语言端是否有效 |
| C | task-level instruction | OFT 连续并行预测 | 只改动作端是否有效 |
| D | steering commands | OFT 连续并行预测 | 在 OFT 之上加入 steering 是否还有增益 |

训练设置保持一致：四组都使用 `batch size=16`，训练 `50000 steps`。这样做的目的是把比较重点放在语言输入形式和动作输出形式上，而不是让训练预算成为显式变量。

这里最关键的对比不是 `D - A`，而是 `D - C`。如果 D 明显高于 C，说明 steering commands 不是只在弥补原版 OpenVLA 离散动作头的不足，而是在 OFT 已经更强的动作输出形式上，仍然提供了额外的条件控制信息。

## 4 个 SimplerEnv 任务覆盖不同操作难点

这次先评估 4 个 WidowX 任务，每个任务都来自 Bridge 风格的桌面操作场景：

<table style="table-layout: fixed;">
  <colgroup>
    <col style="width: 28%" />
    <col style="width: 34%" />
    <col style="width: 38%" />
  </colgroup>
  <thead>
    <tr>
      <th>任务</th>
      <th>主要难点</th>
      <th>评估素材</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code style="white-space: normal; overflow-wrap: anywhere;">widowx_spoon_on_towel</code></td>
      <td>小物体定位和放置区域对齐</td>
      <td><img src="/images/openvla-oft-steerable-experiment/widowx_spoon_on_towel_visual_matching.png" alt="WidowX spoon on towel visual matching task" style="width: 100%; max-width: 260px; border-radius: 0.75rem;" /></td>
    </tr>
    <tr>
      <td><code style="white-space: normal; overflow-wrap: anywhere;">widowx_stack_cube</code></td>
      <td>抓取后保持姿态并完成堆叠</td>
      <td><img src="/images/openvla-oft-steerable-experiment/widowx_stack_cube_visual_matching.png" alt="WidowX stack cube visual matching task" style="width: 100%; max-width: 260px; border-radius: 0.75rem;" /></td>
    </tr>
    <tr>
      <td><code style="white-space: normal; overflow-wrap: anywhere;">widowx_put_eggplant_in_basket</code></td>
      <td>目标容器定位和长一点的运输轨迹</td>
      <td><img src="/images/openvla-oft-steerable-experiment/widowx_put_eggplant_in_basket_visual_matching.png" alt="WidowX put eggplant in basket visual matching task" style="width: 100%; max-width: 260px; border-radius: 0.75rem;" /></td>
    </tr>
    <tr>
      <td><code style="white-space: normal; overflow-wrap: anywhere;">widowx_carrot_on_plate</code></td>
      <td>物体与目标区域的视觉匹配</td>
      <td><img src="/images/openvla-oft-steerable-experiment/widowx_carrot_on_plate_visual_matching.png" alt="WidowX carrot on plate visual matching task" style="width: 100%; max-width: 260px; border-radius: 0.75rem;" /></td>
    </tr>
  </tbody>
</table>

下面是其中两个 rollout 的动图。GIF 更适合放在正文里，不建议作为封面图，因为首页卡片会一起加载封面资源。

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; align-items: start;">
  <figure style="margin: 0;">
    <img src="/images/openvla-oft-steerable-experiment/widowx_put_eggplant_in_basket_rollout.gif" alt="WidowX put eggplant in basket rollout" style="width: 100%; border-radius: 0.75rem;" />
    <figcaption style="font-family: var(--sans); font-size: 0.9rem; color: var(--muted); line-height: 1.5; margin-top: 0.45rem;">put eggplant in basket</figcaption>
  </figure>
  <figure style="margin: 0;">
    <img src="/images/openvla-oft-steerable-experiment/widowx_spoon_on_towel_rollout.gif" alt="WidowX spoon on towel rollout" style="width: 100%; border-radius: 0.75rem;" />
    <figcaption style="font-family: var(--sans); font-size: 0.9rem; color: var(--muted); line-height: 1.5; margin-top: 0.45rem;">spoon on towel</figcaption>
  </figure>
</div>

## OFT 组里 steering 有小幅增益，但没有论文中那么明显

每个任务评估 `100` 个 episode，表中给出闭环成功率。

| 任务 | A：task + discrete AR | B：steering + discrete AR | C：task + OFT | D：steering + OFT |
| --- | ---: | ---: | ---: | ---: |
| spoon on towel | 63% | 67% | 69% | 71% |
| stack cube | 28% | 31% | 34% | 35% |
| eggplant in basket | 78% | 81% | 82% | 83% |
| carrot on plate | 68% | 71% | 72% | 73% |
| 平均成功率 | 59.25% | 62.5% | 64.25% | 65.5% |

三个差值最值得看：

| 对比 | 平均成功率变化 | 解释 |
| --- | ---: | --- |
| `B - A` | +3.25 pp | 在原版离散动作头上，steering commands 比 task-level instruction 略好 |
| `C - A` | +5.0 pp | OFT 的连续并行预测带来稳定收益 |
| `D - C` | +1.25 pp | 在 OFT 已经存在时，steering commands 仍有小幅额外收益 |

这组结果的核心结论不是“steering 在 OFT 上带来和论文原文一样明显的提升”，而是更具体的一点：steering commands 对原版 discrete OpenVLA 有小幅帮助，在 OFT 的连续并行预测已经存在时也仍然有正向增益，但幅度只有 `+1.25 pp`。换句话说，OFT 可能已经解决了这 4 个任务里更主要的动作输出瓶颈，steering 的额外收益被压缩到了一个较小但仍为正的范围内。

这里不能因为增益小，就把它解释成 steering commands 对 OFT 基本无效。更保守的解释有两点。第一，在当前 `50000 steps`、`batch size=16` 的训练预算下，OFT+steering 可能还没有把细粒度语言监督充分转化成闭环成功率优势。steering commands 改变了语言分布，也改变了当前 step 与语言条件之间的对齐关系；如果训练步数不够、batch size 受限或 LoRA 配置没有充分调参，它可能先表现为更高的训练 loss，而不是立刻表现为更高的 SimplerEnv 成功率。第二，OpenVLA 系列模型本来就从 Bridge V2 分布中受益，原始 task-level instruction 组已经是很强的 baseline，因此 steering commands 留下的提升空间会比论文中更小。

任务之间的差异也很清楚。`eggplant in basket` 是最容易的任务，四组都在 `78%` 到 `83%`；`carrot on plate` 稳定在 `68%` 到 `73%`；`spoon on towel` 处在 `63%` 到 `71%`；`stack cube` 最难，四组只有 `28%` 到 `35%`。这说明当前结果的主要差异不只来自模型组别，也来自任务本身的操作难度。尤其是堆叠任务需要更精细的姿态控制和释放时机，单靠更换语言输入形式不一定能解决。

## 训练 loss 低不等于闭环成功率更高

训练曲线里有一个很容易误读的现象：原始 task-level 组的 loss 明显更低，但它的 SimplerEnv 成功率并没有稳定高于 steering 组。也就是说，这里的训练 loss 更像是在说明“模型更容易拟合当前训练分布”，而不是直接说明“闭环控制更好”。

这也暴露了我设计实验前调研不够充分的一点：OpenVLA 系列本来就和 Bridge V2 分布有很强关系。继续用原始 task-level instruction 微调，会让 baseline 享受到语言模板和数据分布上的先验优势；而 steering commands 改了语言粒度，训练目标更难拟合。

第一张图是原版 OpenVLA 动作头。`openvla-pure` 使用原始 task-level instruction，`real-steer` 使用 steering commands。到 50k step 附近，`openvla-pure` 的 `train_loss` 大约是 `0.28`，`real-steer` 大约是 `1.01`；`openvla-pure` 的 `l1_loss` 也更低，`action_accuracy` 更高。这说明原始语言组在训练集上更容易拟合。

![Original OpenVLA task-level instruction and steering command training curves](/images/openvla-oft-steerable-experiment/openvla-task-vs-steering-train-loss.png)

第二张图是 OFT 动作头，也出现了同样趋势。`oft2` 使用原始 task-level instruction，`oft+steering` 使用 steering commands。到 43k step 附近，`oft2` 的 `Next Actions L1 Loss`、总 `Loss` 和 `Curr Action L1 Loss` 都低于 `oft+steering`。这说明低 loss 不是原版 OpenVLA 独有的现象，而是 task-level 语言分布本身更容易被模型拟合。

![OpenVLA-OFT task-level instruction and steering command L1 training curves](/images/openvla-oft-steerable-experiment/oft-task-vs-steering-l1-loss.png)

所以，A 组和 C 组 loss 低、下降快，主要原因很可能是原始 Bridge V2 语言模板已经在 OpenVLA 系列模型的预训练或微调分布中出现过。task-level instruction 组是在熟悉的语言分布上继续拟合；steering command 组换成了更细粒度、和时间步更强绑定的语言条件，训练损失自然更高。

因此这组实验不能用训练 loss 直接判断哪组更好。task-level 组训练指标更好，但闭环成功率不占优；steering 组训练 loss 更高，却仍然在 discrete 和 OFT 两种动作头上带来了小幅成功率提升。对 VLA 来说，离线动作拟合和闭环执行之间还有误差累积、视觉状态偏移、阶段切换等差异，steering commands 的收益更可能体现在这些闭环因素上。

因为 D 组只比 C 组小幅更好，最有说服力的证据不只是平均成功率，而是具体失败模式。这里要分别检查两类 case：一类是 B 比 A 稳定的 discrete 任务，另一类是 D 比 C 多成功的 OFT 任务。前者说明 steering commands 是否真的改善了原版 OpenVLA 的条件控制；后者说明细粒度语言在 OFT 动作头之上还能改善哪些闭环阶段。如果 C 和 D 都失败，才更可能说明当前瓶颈已经转移到动作精度、接触 dynamics 或任务本身难度。

还需要单独检查训练预算这个变量。如果 D 组的训练曲线还没有明显收敛，或者后半段仍在下降，那么当前 `+1.25 pp` 更像是“预算不足下已经出现的小幅增益”，而不是 OFT+steering 的最终上限。尤其是连续动作回归和 action chunk 预测本来就比原版离散 token 微调更吃训练稳定性，`50000 steps` 和 `batch size=16` 不一定足够把 steering commands 的收益完全训出来。

## 实验结论：steering 有小幅收益，但强 baseline 压缩了提升空间

这组实验的结论需要写得受限一些：

1. OFT 是这组实验里更稳定的收益来源。它把动作输出从离散自回归改成连续并行预测后，平均成功率有提升。
2. steering commands 对 discrete OpenVLA 有小幅帮助，在 OFT 组里也有正向增益。关键证据是 `D - C = +1.25 pp`，而不是只看 `D - A`。
3. 这个增益没有 Steerable Policies 论文原文里那么明显。一个原因是训练预算有限，`50000 steps` 和 `batch size=16` 可能还不足以充分利用细粒度语言监督。
4. 另一个原因是 OpenVLA 系列模型本来就从 Bridge V2 分布中受益。原始 task-level instruction 组的语言模板和预训练/微调分布高度重合，会让 C 组成为很强的 baseline，从而压缩 D 组能额外提升的空间。

任务级差异也很重要。`eggplant in basket` 最高、`stack cube` 最低，说明任务难度本身是主要因素之一；steering 在 discrete 组和 OFT 组都带来小幅提升，但提升幅度不大，说明细粒度语言的收益可能被更强的动作输出形式和更强的 Bridge V2 task-level baseline 部分压缩。后续如果继续增加训练预算，最需要重新观察的仍然是 `D - C`：如果这个差值继续扩大，才能说明 steering 在 OFT 之上提供了更稳定的额外增益。
