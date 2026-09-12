---
title: OpenVLA-OFT 上加入 steering commands 是否还有增益：Bridge V2 到 SimplerEnv 的 2×2 实验
date: 2026-05-25
summary: 用占位数据整理一组 2×2 消融实验：语言端比较 task-level instruction 和 steering commands，动作端比较 OpenVLA 离散自回归和 OFT 连续并行预测，并分析 OpenVLA 在 Bridge V2 上 loss 很低的可能原因。
tags:
  - openvla
  - openvla-oft
  - steerable-policies
  - robotics
  - simplerenv
category: embodied-ai
cover_image: /images/openvla-oft-steerable-experiment/openvla-oft-steering-2x2-cover.png
featured_slot: 1
cover_alt: OpenVLA, OFT, and Steering 2x2 experiment cover explaining language-side and action-side ablations
draft: true
---

# OpenVLA-OFT 上加入 steering commands 是否还有增益：Bridge V2 到 SimplerEnv 的 2×2 实验

这篇草稿整理一组 2×2 实验：在 Bridge V2 上微调模型，再用 SimplerEnv 的 4 个 WidowX 任务检查 steering commands 在 OFT 连续并行预测之上是否还有增益。训练记录和模型链接已列在下方，闭环成功率仍是占位数据，尚不能据此判断方法效果。

Steerable Policies 这项工作改了低层 policy 的语言接口。原始 OpenVLA 通常接收 task-level instruction，例如 “put the eggplant in the basket”；Steerable Policies 则希望低层策略能接收更细粒度的中间命令，例如当前阶段该靠近哪个物体、移动到哪个区域、如何对齐抓取或放置。这样做的目标是让高层 VLM 或 embodied reasoner 不只输出一个粗任务名，而是能把分解后的控制意图传给低层动作策略。

实验把语言监督与动作输出分开比较，避免把同时修改两部分得到的变化都归因于 steering。

下面所有成功率都是**占位数据**，只用于说明文章结构和结果解释方式。真实实验数值替换后，结论需要重新检查，尤其是 `D - C` 这一项。

## 4 组微调模型已经开源

为了方便复现和后续对比，这次实验对应的 4 个 checkpoint 都已经放到 Hugging Face。它们正好对应后文的 A/B/C/D 四组设置：

![Hugging Face checkpoints for the OpenVLA, OpenVLA-OFT, and steering command experiments](/images/openvla-oft-steerable-experiment/huggingface-openvla-checkpoints.png)

| 组别 | Hugging Face checkpoint | 对应设置 |
| --- | --- | --- |
| A | [`TxTxx/openvla-bridgev2-refinetuned`](https://huggingface.co/TxTxx/openvla-bridgev2-refinetuned) | task-level instruction + OpenVLA 离散自回归 |
| B | [`TxTxx/openvla-steerable-bridgev2`](https://huggingface.co/TxTxx/openvla-steerable-bridgev2) | steering commands + OpenVLA 离散自回归 |
| C | [`TxTxx/openvla-oft-bridgev2`](https://huggingface.co/TxTxx/openvla-oft-bridgev2) | task-level instruction + OFT 连续并行预测 |
| D | [`TxTxx/openvla-oft-steerable-bridgev2`](https://huggingface.co/TxTxx/openvla-oft-steerable-bridgev2) | steering commands + OFT 连续并行预测 |

## 实验设计把语言端和动作端拆开

这组实验是一个 2×2 设计。第一个维度是语言输入：使用原始 `task-level instruction`，还是使用 Steerable Policies 风格的细粒度 `steering commands`。第二个维度是动作输出：使用原版 OpenVLA 的离散自回归动作 token，还是使用 OpenVLA-OFT 的连续并行动作预测。

四组模型如下：

| 组别 | 语言输入 | 动作输出 | 这组实验回答的问题 |
| --- | --- | --- | --- |
| A | task-level instruction | OpenVLA 离散自回归 | 原始 OpenVLA 微调基线 |
| B | steering commands | OpenVLA 离散自回归 | 只改语言端是否有效 |
| C | task-level instruction | OFT 连续并行预测 | 只改动作端是否有效 |
| D | steering commands | OFT 连续并行预测 | 在 OFT 之上加入 steering 是否还有增益 |

`D - C` 用来检查 OFT 设置下更换语言监督的收益；`B - A` 对应原版动作输出下的同一问题。`D - A` 同时改变了两个因素，不能单独用于归因。

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

下面保留两个任务的 rollout 动图，作为场景参考。

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

## 占位结果：表格与差值计算示例

以下示例假设每个任务评估 `100` 个 episode。表中数值不是真实测量，不能引用为实验结果。

| 任务 | A：task + discrete AR | B：steering + discrete AR | C：task + OFT | D：steering + OFT |
| --- | ---: | ---: | ---: | ---: |
| spoon on towel | 63% | 67% | 69% | 68% |
| stack cube | 28% | 31% | 34% | 33% |
| eggplant in basket | 78% | 81% | 82% | 80% |
| carrot on plate | 68% | 71% | 72% | 71% |
| 平均成功率 | 59.25% | 62.5% | 64.25% | 63.0% |

由占位数值计算的差值如下：

| 对比 | 平均成功率变化 | 解释 |
| --- | ---: | --- |
| `B - A` | +3.25 pp | 示例中 B 高于 A 3.25 个百分点 |
| `C - A` | +5.0 pp | 示例中 C 高于 A 5.0 个百分点 |
| `D - C` | -1.25 pp | 示例中 D 低于 C 1.25 个百分点 |

真实评估需要替换整张表，并记录 episode 数、随机种子和评估条件。即使得到接近的均值，也不能直接认定 steering 无效，或把差异归因于训练不足；这些解释都需要额外对照。占位表中的任务排序同样不代表实际难度排序。

## OpenVLA 的低 loss 可能来自 Bridge V2 预训练分布

已有训练记录中，原始 task-level instruction 组的 loss 较低。闭环结果尚未填入，因此目前只能讨论训练曲线，不能判断较低的 loss 是否对应更高成功率。

先看原版 OpenVLA 动作头的训练曲线。`openvla-pure` 使用原始 task-level instruction，`real-steer` 使用 steering commands。截图中同一位置的 hover 数值显示，`openvla-pure` 的 `train_loss`、`l1_loss` 都明显低于 `real-steer`，训练集上的 `action_accuracy` 也更高。

![Original OpenVLA task-level instruction and steering command training curves](/images/openvla-oft-steerable-experiment/openvla-task-vs-steering-train-loss.png)

OpenVLA 本身在 Open X-Embodiment 数据上训练过，而 Bridge V2 是其中非常重要的一部分。微调时如果继续使用 Bridge V2 原始 task-level instruction，模型看到的语言模板很可能和预训练阶段高度重合。即使用了图像增强来减弱视觉端的分布重合，语言端仍然没有被同等程度地扰动。

OFT 组也有类似现象。`oft2` 使用原始 task-level instruction，`oft+steering` 使用 steering commands。截图里 `oft2` 的 `Next Actions L1 Loss`、总 `Loss` 和 `Curr Action L1 Loss` 都低于 `oft+steering`。在这次记录中，两种动作输出设置都出现了 task-level 组训练误差较低的情况；原因还需要进一步检查。

![OpenVLA-OFT task-level instruction and steering command L1 training curves](/images/openvla-oft-steerable-experiment/oft-task-vs-steering-l1-loss.png)

可能的解释和需要保留的限制如下：

| 现象 | 可能原因 | 不能直接推出什么 |
| --- | --- | --- |
| task-level instruction 组 loss 很低 | 原始 Bridge V2 语言模板已经在预训练中见过 | 不能直接推出它在闭环评估中会高于 steering 组 |
| 原版 OpenVLA 收敛很快 | 离散动作 token 和单步预测目标更接近原训练范式 | 不能直接和 OFT 的连续 L1 loss 横向比较 |
| steering command 组 loss 更高 | 细粒度命令改变了语言分布和时间步对齐方式 | 不能直接推出 steering 对成功率无效 |

不同语言分布和动作目标下的 loss 不能直接用于排列策略优劣。训练曲线反映离线动作拟合；闭环评估还涉及误差累积和状态变化，需要单独测量。预训练分布重合是一个待检查的假设，不是由这些曲线已经证明的原因。

## 评估时记录失败发生在哪一步

除成功率外，可以按下面的类别记录失败，并对照当时的观测、命令和动作。它们用于提出后续检查方向，不能仅凭单条 rollout 判断因果。

训练预算也需要单独对照。如果某组训练曲线仍在下降，可以延长训练后复测；在此之前，不预设差异一定来自预算不足。

| 失败类型 | 可能表现 | 后续检查方向 |
| --- | --- | --- |
| 目标物体选错 | 能移动到桌面区域，但抓错物体或靠近错误目标 | 命令中的子目标是否明确、是否与当前阶段对齐 |
| 放置区域偏移 | 抓取成功，但放置到 towel、plate、basket 外侧 | 空间描述与放置阶段是否对应 |
| 堆叠时姿态不稳 | 抓到 cube，但对齐和释放失败 | 动作精度、姿态控制与释放时机 |

下图目前只作任务场景参考，尚未标记对应模型和失败阶段。

![WidowX carrot on plate visual matching task](/images/openvla-oft-steerable-experiment/widowx_carrot_on_plate_visual_matching.png)

## 发布前还需要补齐的记录

这篇草稿目前保留实验设计、checkpoint 链接和训练曲线，成功率表仍待替换。发布前需要补齐各组真实评估结果、episode 数、随机种子、训练预算，以及 rollout 对应的模型和命令。只有这些记录齐全后，才能讨论 `D - C` 是否存在稳定差异。
