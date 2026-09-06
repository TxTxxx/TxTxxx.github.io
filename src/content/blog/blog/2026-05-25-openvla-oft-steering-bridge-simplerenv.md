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

本文验证一个具体问题：当 OpenVLA 的动作输出已经换成 OFT 的连续并行预测后，Steerable Policies 风格的细粒度 `steering commands` 是否还能带来额外成功率提升。实验在 Bridge V2 上微调，在 SimplerEnv 中评估 4 个 WidowX 任务。

Steerable Policies 这项工作改了低层 policy 的语言接口。原始 OpenVLA 通常接收 task-level instruction，例如 “put the eggplant in the basket”；Steerable Policies 则希望低层策略能接收更细粒度的中间命令，例如当前阶段该靠近哪个物体、移动到哪个区域、如何对齐抓取或放置。这样做的目标是让高层 VLM 或 embodied reasoner 不只输出一个粗任务名，而是能把分解后的控制意图传给低层动作策略。

这也带来一个自然问题：如果动作端本身已经被 OpenVLA-OFT 改强了，语言端继续换成 steering commands 还有没有必要？本文的 2×2 实验就是围绕这个问题设计的。

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

## 占位结果显示 OFT 组成功率接近，steering 主要改善 discrete 组

先按每个任务 `100` 个 episode 计算成功率。再次强调：这张表里的数值是占位数据，用来展示你替换真实实验结果后文章应该如何读。

| 任务 | A：task + discrete AR | B：steering + discrete AR | C：task + OFT | D：steering + OFT |
| --- | ---: | ---: | ---: | ---: |
| spoon on towel | 63% | 67% | 69% | 68% |
| stack cube | 28% | 31% | 34% | 33% |
| eggplant in basket | 78% | 81% | 82% | 80% |
| carrot on plate | 68% | 71% | 72% | 71% |
| 平均成功率 | 59.25% | 62.5% | 64.25% | 63.0% |

按这组占位数据，三个差值最值得看：

| 对比 | 平均成功率变化 | 解释 |
| --- | ---: | --- |
| `B - A` | +3.25 pp | 在原版离散动作头上，steering commands 比 task-level instruction 略好 |
| `C - A` | +5.0 pp | OFT 的连续并行预测带来稳定收益 |
| `D - C` | -1.25 pp | 在 OFT 已经存在时，steering commands 没有带来稳定额外收益 |

如果真实结果接近这个趋势，文章的核心结论就不是“steering 在 OFT 上继续显著提升”，而是更具体的一点：steering commands 对原版 discrete OpenVLA 有小幅帮助，但在 OFT 的连续并行预测已经存在时，task-level 和 steering 两种语言输入的闭环成功率接近。换句话说，OFT 可能已经解决了这 4 个任务里更主要的动作输出瓶颈，steering 的额外收益没有在这个设置下稳定表现出来。

这里不能把 `D - C` 接近 0 直接解释成 steering commands 对 OFT 无效。更保守的解释是：在当前训练步数和训练资源预算下，OFT+steering 还没有把细粒度语言监督充分转化成闭环成功率优势。steering commands 改变了语言分布，也改变了当前 step 与语言条件之间的对齐关系；如果训练步数不够、batch size 受限或 LoRA 配置没有充分调参，它可能先表现为更高的训练 loss，而不是立刻表现为更高的 SimplerEnv 成功率。

任务之间的差异也很清楚。`eggplant in basket` 是最容易的任务，四组都在 `78%` 到 `82%`；`carrot on plate` 稳定在 `68%` 到 `72%`；`spoon on towel` 处在 `63%` 到 `69%`；`stack cube` 最难，四组只有 `28%` 到 `34%`。这说明当前结果的主要差异不只来自模型组别，也来自任务本身的操作难度。尤其是堆叠任务需要更精细的姿态控制和释放时机，单靠更换语言输入形式不一定能解决。

## OpenVLA 的低 loss 可能来自 Bridge V2 预训练分布

训练时有一个现象很明显：没有经过 steering command 训练的 OpenVLA 收敛特别快，loss 也很低。但这个低 loss 没有稳定转化成更高的 SimplerEnv 成功率；在这组实验里，原始 task-level 组的闭环结果和 steering 组接近，甚至低于 steering 组。这说明训练损失和闭环控制成功率在这里不能直接等价。

先看原版 OpenVLA 动作头的训练曲线。`openvla-pure` 使用原始 task-level instruction，`real-steer` 使用 steering commands。截图中同一位置的 hover 数值显示，`openvla-pure` 的 `train_loss`、`l1_loss` 都明显低于 `real-steer`，训练集上的 `action_accuracy` 也更高。

![Original OpenVLA task-level instruction and steering command training curves](/images/openvla-oft-steerable-experiment/openvla-task-vs-steering-train-loss.png)

OpenVLA 本身在 Open X-Embodiment 数据上训练过，而 Bridge V2 是其中非常重要的一部分。微调时如果继续使用 Bridge V2 原始 task-level instruction，模型看到的语言模板很可能和预训练阶段高度重合。即使用了图像增强来减弱视觉端的分布重合，语言端仍然没有被同等程度地扰动。

OFT 组也有类似现象。`oft2` 使用原始 task-level instruction，`oft+steering` 使用 steering commands。截图里 `oft2` 的 `Next Actions L1 Loss`、总 `Loss` 和 `Curr Action L1 Loss` 都低于 `oft+steering`。这说明低训练误差并不是某一个动作头独有的现象，而是 task-level 语言分布更容易被当前模型拟合。

![OpenVLA-OFT task-level instruction and steering command L1 training curves](/images/openvla-oft-steerable-experiment/oft-task-vs-steering-l1-loss.png)

因此，A 组和 C 组 loss 低、下降快，至少有三种可能解释：

| 现象 | 可能原因 | 不能直接推出什么 |
| --- | --- | --- |
| task-level instruction 组 loss 很低 | 原始 Bridge V2 语言模板已经在预训练中见过 | 不能直接推出它在闭环评估中会高于 steering 组 |
| 原版 OpenVLA 收敛很快 | 离散动作 token 和单步预测目标更接近原训练范式 | 不能直接和 OFT 的连续 L1 loss 横向比较 |
| steering command 组 loss 更高 | 细粒度命令改变了语言分布和时间步对齐方式 | 不能直接推出 steering 对成功率无效 |

这个解释有一个很实际的后果：训练 loss 在这组实验里只能用来判断同一设置内部是否正常收敛，不能作为跨组优劣的主要证据。尤其是 `task-level instruction` 和 `steering commands` 的语言分布不同，`discrete AR` 和 `OFT continuous` 的动作目标也不同，把它们的 loss 放在一张图上比较大小很容易误导。更准确的读法是：task-level 组更容易拟合 Bridge V2 训练分布，但 steering 组可能在闭环执行时给模型提供了更明确的阶段性控制条件。

这也是这组实验里最值得单独写下来的现象：task-level 组训练指标更好，但闭环成功率没有稳定高于 steering 组。对 VLA 来说，训练阶段的 action token 或 action regression 误差只衡量了离线数据上的一步或一段动作拟合；SimplerEnv 的成功率还取决于误差累积、视觉状态偏移、阶段切换和目标条件是否清楚。steering commands 的收益如果存在，更可能体现在这些闭环因素上，而不是体现在更低的训练 loss 上。

## steering commands 的收益应该从失败模式里判断

因为占位结果里 D 组和 C 组接近，最有说服力的证据不只是平均成功率，而是具体失败模式。这里要分别检查两类 case：一类是 B 比 A 稳定的 discrete 任务，另一类是 C 和 D 都失败的 OFT 任务。前者说明 steering commands 是否真的改善了原版 OpenVLA 的条件控制；后者说明当前瓶颈是否已经转移到动作精度、接触 dynamics 或任务本身难度。

还需要单独检查训练预算这个变量。如果 D 组的训练曲线还没有明显收敛，或者后半段仍在下降，那么当前结果更像是“预算不足下的中间状态”，而不是 OFT+steering 的最终上限。尤其是连续动作回归和 action chunk 预测本来就比原版离散 token 微调更吃训练稳定性，资源不足会更容易压低 D 组的表现。

| 失败类型 | 可能表现 | 如果 steering 改善，说明什么 |
| --- | --- | --- |
| 目标物体选错 | 能移动到桌面区域，但抓错物体或靠近错误目标 | steering command 提供了更明确的当前子目标 |
| 放置区域偏移 | 抓取成功，但放置到 towel、plate、basket 外侧 | steering command 改善了空间条件和阶段性约束 |
| 堆叠时姿态不稳 | 抓到 cube，但对齐和释放失败 | 主要瓶颈可能不是语言输入，而是精细动作控制 |

下面这张图可以用来放一个视觉匹配或典型任务状态。后续替换真实案例时，最好在图注里写清楚：这是哪一组模型、哪条指令、失败发生在第几个阶段。

![WidowX carrot on plate visual matching task](/images/openvla-oft-steerable-experiment/widowx_carrot_on_plate_visual_matching.png)

## 目前结论应当写成受限结论

在真实数据替换之前，本文只能给出一个结果解释框架。按上面的占位数据，比较稳的写法是：

1. OFT 是这组实验里更稳定的收益来源。它把动作输出从离散自回归改成连续并行预测后，平均成功率有提升。
2. steering commands 对 discrete OpenVLA 有小幅帮助，但在 OFT 组里没有稳定高于 task-level instruction。关键证据是 `D - C` 接近 0，而不是只看 `D - A`。
3. OpenVLA 原始 task-level 组的低 loss 需要谨慎解释。Bridge V2 预训练和原始语言模板重合，会让训练看起来很顺，但这不等价于更好的闭环控制。
4. 当前结果还受到训练步数和训练资源限制。OFT+steering 没有明显超过 OFT task-level，不一定说明 steering 方向无效，也可能是细粒度语言监督需要更长训练、更大 batch 或更仔细的超参搜索。

真实结果替换后，最需要重新检查的是任务级差异。如果 `eggplant in basket` 仍然最高、`stack cube` 仍然最低，说明任务难度本身是主要因素之一；如果 steering 只在 discrete 组带来小幅提升，而 OFT 组基本持平，说明细粒度语言的收益可能被更强的动作输出形式部分覆盖；如果真实的 `D - C` 最后转正且稳定，才适合把结论改成“steering 在 OFT 上仍有额外增益”。
