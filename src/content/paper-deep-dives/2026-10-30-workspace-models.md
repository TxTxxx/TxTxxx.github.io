---
title: "Workspace Models：把历史筛选蒸馏为机器人记忆"
paper_title: "Workspace Models: Lightweight Robotic Memory via Saliency-Driven Supervision"
date: 2026-10-30
authors: "Nitish Dashora、Douglas Chen、Idan Shenfeld、John Marangola、Pulkit Agrawal、Max Simchowitz"
institutions: "Massachusetts Institute of Technology、Carnegie Mellon University"
venue: "CoRL 2026（已接收）"
summary: "解释关键图块集合重建如何训练潜在记忆，核对真机 20 次评测、相机差异与部署延迟。"
reading_time: "约 5 分钟"
paper_url: "https://arxiv.org/pdf/2609.20820v3"
hero_image: "/images/paper-radar/2026-10-30-workspace-models/saliency-set-reconstruction-and-policy.png"
hero_alt: "Workspace 编码器通过重建 VLM 选出的显著图块集合学习历史记忆，冻结后为 Diffusion Policy 提供条件。"
draft: false
---

<section class="deep-section" id="problem">
  <h2>记住被遮挡的计数，同时保留精细控制信息</h2>
  <p>Workspace Models 研究部分可观测操控中的历史记忆。机器人把方块放进看不见内部的箱子后，当前画面不足以判断已放数量；直接堆叠历史帧又可能干扰抓取。方法在训练时用 VLM 选择重要信息，学习一个部署时可快速更新的潜在表示。</p>
  <p>本导读由 Codex 整理，采用<a href="https://arxiv.org/abs/2609.20820v3">2026-09-30 的 arXiv v3</a>，首发于 2026-09-17。<a href="https://msimchowitz.github.io/publications/">作者发表记录</a>列为 CoRL 2026，链接其<a href="https://openreview.net/forum?id=aPosmVaV9y">会议条目</a>。作者来自 MIT 与 CMU；共同指导者 Agrawal、Simchowitz 还共同参与 ICLR 2025 的 Diffusion Policy Policy Optimization，团队在生成式控制方向有连续研究。</p>
</section>

<section class="deep-section" id="method">
  <h2>重建显著图块集合，再冻结记忆编码器</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-30-workspace-models/saliency-set-reconstruction-and-policy.png"><img src="/images/paper-radar/2026-10-30-workspace-models/saliency-set-reconstruction-and-policy.png" width="1760" height="776" style="height:auto" alt="Figure 3：左侧将 DINOv3 图像特征和本体状态编码为 workspace token，解码器用集合重建损失匹配显著图块与空槽位；右侧冻结编码器，将短历史 workspace token 与本体状态输入可训练的 Diffusion Policy，输出动作块。" /></a>
    <figcaption>Figure 3，PDF 文件第 5 页。Nitish Dashora、Douglas Chen、Idan Shenfeld、John Marangola、Pulkit Agrawal、Max Simchowitz，《Workspace Models: Lightweight Robotic Memory via Saliency-Driven Supervision》，arXiv v3（2026-09-30）。<a href="https://arxiv.org/pdf/2609.20820v3#page=5">原 PDF</a> · <a href="https://arxiv.org/abs/2609.20820v3">许可声明来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁去页边、图注与正文，保留完整机制图；点击查看高清图。</figcaption>
  </figure>
  <p>看左侧的集合重建，再看右侧冻结标记。训练要求潜在记忆保留能重建关键图块的信息，策略训练时则只读取记忆和本体状态；解码器与 VLM 的筛选流程无需留在控制循环里。它学习的是供策略使用的历史表示。</p>
  <p>Qwen3-VL-8B 判断哪些时刻发生关键事件，MolmoPoint 定位相关区域；DINOv3 图块特征组成监督集合。因果 Transformer 编码历史，DETR 式解码器经匈牙利匹配预测图块和槽位有效性。随后冻结编码器，以短窗口的记忆 token 训练 Diffusion Policy 输出动作块。</p>
</section>

<section class="deep-section" id="evidence">
  <h2>一个真机任务达到 85%，三个仿真任务另行评估</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-30-workspace-models/real-and-sim-memory-task-success.png"><img src="/images/paper-radar/2026-10-30-workspace-models/real-and-sim-memory-task-success.png" width="2375" height="700" style="height:auto" loading="lazy" alt="Figure 6 完整四面板：左侧 HalfAndHalf 为真机，Workspace 成功率 85%，Vanilla 45%，History 0%、Keyframe 35%，后两者标注增加腕部相机；其余 CubeDrop、DrawerRecall、BalanceBar 为仿真，保留纵轴、图例、误差条和全部标注。" /></a>
    <figcaption>Figure 6，PDF 文件第 9 页。Nitish Dashora 等，同上论文，arXiv v3（2026-09-30）。<a href="https://arxiv.org/pdf/2609.20820v3#page=9">原 PDF</a> · <a href="https://arxiv.org/abs/2609.20820v3">许可声明来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。裁去页边、图注和正文，完整保留四组实验及共享图例；密集标注可点击高清图细看。</figcaption>
  </figure>
  <p>先区分左侧 Real 与右侧三个 Simulated。真机 HalfAndHalf 的 20 次测试中，Workspace 成功 17 次，VanillaDP 为 9 次；三个仿真任务各测试 100 次，Workspace 为 92%、100%、89%。论文未明确图中误差条统计口径，不能将其当作多次独立训练的方差。</p>
  <p>真机用 FR3、平行夹爪与固定 D435，任务是把 2 或 4 个方块平均放入两个遮挡内部的箱子。训练来自四种配置各 75 段、合计 300 段遥操作，测试只使用其中一种初始配置。附录 B.2 的记忆模型训练采用一个种子、80/20 划分，并按验证损失选模。</p>
  <p>HistoryDP 和 Keyframe 因全局相机下抓取困难，增加了腕部相机；比较不能视为完全相同输入。附录还手动清理早期错误事件检测，并为真机瞬时图块使用固定位置。结果支持这些任务中的记忆学习，尚不足以证明自动标注和任意环境泛化。</p>
</section>

<section class="deep-section" id="limits">
  <h2>减少部署时的 VLM 开销，仍受长历史与监督质量限制</h2>
  <p>表 1 报告 Wksp 原始延迟 94.9 毫秒，启用批处理和 KV 缓存后为 49.2 毫秒；VanillaDP 为 41.3 毫秒，批处理 Keyframe 为 199.5 毫秒。数字衡量动作块之间的策略计算，不能直接换算成物理控制频率或整任务加速比。</p>
  <p>完整自回归编码器的计算随历史长度二次增长，VLM 选出的显著区域也未必完全对应控制需求。论文没有比较语言摘要加 VLA 的层级系统，也未验证跨本体迁移；本次未核实到配套官方代码或权重入口。</p>
</section>

<section class="deep-section" id="reading">
  <h2>先读集合监督，再核对相机与标注辅助条件</h2>
  <p>PDF 第 5–7 页读架构和 VLM 标注；第 8–9 页查延迟、试验次数与相机差异；第 21 页查训练划分，第 24–25 页查真机演示和标签清理，第 12 页读局限。比较其他机器人记忆方法时，同时记录历史覆盖范围、测试输入与人工辅助。</p>
</section>
