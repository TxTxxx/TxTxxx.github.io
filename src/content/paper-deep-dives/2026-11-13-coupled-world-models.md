---
title: "用扩散模型生成轨迹，用局部模型训练策略"
paper_title: "Coupled Local and Global World Models for Efficient First Order RL"
date: 2026-11-13
authors: "Joseph Amigo、Rooholla Khorrambakht、Nicolas Mansard、Ludovic Righetti"
institutions: "纽约大学 Machines in Motion Lab、LAAS-CNRS、ANITI"
venue: "CoRL 2026 已接收"
summary: "从真实机器人数据拟合视频动力学，把前向轨迹和反向梯度交给两个模型，并用三项真机实验检验策略。"
reading_time: "约 5 分钟"
paper_url: "https://arxiv.org/pdf/2602.06219v3"
project_url: "https://coupled-global-local-wm-rl.pages.dev/"
hero_image: "/images/paper-radar/2026-11-13-coupled-world-models/global-rollout-local-gradient.png"
hero_alt: "四步流程依次展示真机数据采集、全局模型训练、局部模型预训练和解耦的策略更新。"
draft: false
---

<section class="deep-section" id="forward-backward">
  <h2>扩散模型生成观测，RSSM 近似动力学梯度</h2>
  <p>Codex 整理。用真实机器人交互训练视频世界模型，可以让策略在预测轨迹上反复试错。本文关注训练的另一项成本：若对大型扩散模型逐步反传，显存和时间都随想象轨迹增长。Amigo 等人把 CoRL 2025 的解耦策略优化方法 DMO 扩展到视觉输入，用从真机数据训练的扩散模型承担原先物理模拟器的前向工作。<a href="https://arxiv.org/abs/2602.06219v3">论文与录用信息</a> · <a href="https://proceedings.mlr.press/v305/amigo25a.html">前作 DMO</a></p>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-13-coupled-world-models/global-rollout-local-gradient.png"><img src="/images/paper-radar/2026-11-13-coupled-world-models/global-rollout-local-gradient.png" width="997" height="786" style="height:auto" alt="上排展示真机交互采集、扩散世界与奖励模型训练、RSSM 预训练；下排从全局模型的下一帧向下编码，再通过局部模型传回梯度。" /></a>
    <figcaption>Figure 2，PDF 文件第 4 页。Amigo、Khorrambakht、Mansard、Righetti，《Coupled Local and Global World Models for Efficient First Order RL》，arXiv:2602.06219v3。裁出完整图示，点击可看高清图。 <a href="https://arxiv.org/pdf/2602.06219v3#page=4">原 PDF</a> · <a href="https://arxiv.org/abs/2602.06219v3">版本与许可标注</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></figcaption>
  </figure>
  <p>沿图下半部 Step 4 的箭头看：策略动作送进冻结的扩散模型，生成下一帧及相应奖励预测。生成帧经编码器映射到局部潜空间，RSSM 在这些状态上计算单步动力学导数，把梯度传回策略。轨迹沿全局模型推进，局部模型在策略训练期间继续用这些轨迹校准。附录 A.3 用穿过全局模型的部分梯度作参考，G1 上的方向余弦相似度为 0.52，衡量的是近似梯度与该参考的对齐程度。<a href="https://arxiv.org/pdf/2602.06219v3#page=14">附录 A.3</a></p>
</section>

<section class="deep-section" id="efficiency">
  <h2>同一全局模型下的样本效率与训练时间</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-13-coupled-world-models/sample-and-time-efficiency.png"><img src="/images/paper-radar/2026-11-13-coupled-world-models/sample-and-time-efficiency.png" width="881" height="336" style="height:auto" alt="三项任务汇总的两张曲线图，纵轴为归一化奖励，横轴分别为归一化模型样本数和训练时间，含 DMO、PPO、SAC、IQL 及两项消融。" /></a>
    <figcaption>Figure 5，PDF 文件第 8 页。Amigo、Khorrambakht、Mansard、Righetti，《Coupled Local and Global World Models for Efficient First Order RL》，arXiv:2602.06219v3。保留两个子图及图例，点击可看高清图。 <a href="https://arxiv.org/pdf/2602.06219v3#page=8">原 PDF</a> · <a href="https://arxiv.org/abs/2602.06219v3">版本与许可标注</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></figcaption>
  </figure>
  <p>左图按世界模型内采样步数对齐，右图按训练用时对齐。蓝线在两图中都比绿色 PPO 更早达到较高的归一化奖励，PPO 与 SAC 共用相同的全局模型、奖励模型和初始状态分布。每组在线训练跑四个随机种子，阴影表示跨任务的标准差。纵轴是模型预测奖励，真机任务成功率另见同页 Tables 1–3。<a href="https://arxiv.org/pdf/2602.06219v3#page=16">曲线归一化说明</a></p>
</section>

<section class="deep-section" id="hardware">
  <h2>三种机器人各有训练数据和部署条件</h2>
  <p>Push-T 用 4 小时真机交互训练世界模型，部署时 DMO 为 9/10，PPO 按严格标准为 1/10，允许短暂经过目标位姿时为 4/10。G1 抓箱任务中，DMO 为 8/10，ACT 为 7/10，单组十次试验不足以判断两者差距有多稳定。Go2 推方块进球时，ACT 只把物体推到球门附近，表中对它使用了放宽的判定。三项任务各自训练，结果反映方法在不同平台上的适用性。<a href="https://arxiv.org/pdf/2602.06219v3#page=8">真机对照表</a></p>
  <p>G1 的世界模型使用 16.5 小时交互，加上七轮针对模型错误补采的 4.4 小时真机数据。附录示例中，策略发现抬手就能让预测里的箱子跳到手中，作者据此回到真机收集对应动作的结果。Go2 和 G1 的奖励训练也依赖人工标注。先读 §3.1、§3.4 和 Figure 2，再对照 Figure 5 与真机表，最后看附录 A.2 的补采过程和 A.3 的梯度与算力测量。<a href="https://arxiv.org/pdf/2602.06219v3#page=13">补采数据与模型误差</a></p>
</section>
