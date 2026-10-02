---
title: "Self-Improving EFMs：剩余步数如何变成机器人训练奖励"
paper_title: "Self-Improving Embodied Foundation Models"
date: 2026-10-02
authors: "Seyed Kamyar Seyed Ghasemipour、Ayzaan Wahid、Jonathan Tompson、Pannag Sanketi、Igor Mordatch"
institutions: "Google DeepMind（项目完成地）；Generalist（第一作者发表时任职）"
venue: "NeurIPS 2025 主会 · arXiv v1（2025-09-18）"
summary: "从动作与进度的联合监督到在线 REINFORCE，核对真机数据预算和自主练习的边界。"
reading_time: "约 5 分钟"
paper_url: "https://arxiv.org/pdf/2509.15155v1"
project_url: "https://self-improving-efms.github.io/"
hero_image: "/images/paper-radar/2026-10-02-self-improving-efms/two-stage-self-improvement.png"
hero_alt: "两阶段训练：离线学习动作和剩余步数，在线通过冻结奖励模型更新机器人策略。"
draft: false
---

<section class="deep-section" id="problem">
  <span class="section-index">01 / PROBLEM</span>
  <h2>自主练习需要可计算的进度与终止信号</h2>
  <p>模仿学习能给机器人一个初始策略，但在线改善策略还需要奖励。这篇工作让视觉语言模型预测“距离目标还有多少步”，用预测值的下降奖励动作，并判断何时停止。它研究真实交互中的策略后训练，不生成未来视频，也不在世界模型里做规划。</p>
  <p>本文由 Codex 整理，不代表个人已读或独立复现。采用<a href="https://arxiv.org/abs/2509.15155v1">2025-09-18 的 arXiv v1</a>，接收状态已对照<a href="https://papers.neurips.cc/paper_files/paper/2025/hash/a3ac59dc0bf607fa35535f546110fc34-Abstract-Conference.html">NeurIPS 2025 正式论文集</a>。项目在 Google DeepMind 完成；作者 Wahid、Tompson、Mordatch 也参与了 <a href="https://robotic-transformer-x.github.io/">Open X-Embodiment / RT-X</a>。</p>
</section>

<section class="deep-section" id="method">
  <span class="section-index">02 / METHOD</span>
  <h2>冻结进度预测器，只更新执行策略</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-02-self-improving-efms/two-stage-self-improvement.png"><img src="/images/paper-radar/2026-10-02-self-improving-efms/two-stage-self-improvement.png" alt="Figure 1：左侧从预训练模型学习动作和 steps-to-go；右侧多机器人采样后，由带雪花标记的冻结奖励模型标注轨迹，再更新策略。" width="2500" height="930" style="height:auto" /></a>
    <figcaption>Figure 1，PDF 文件第 2 页。Seyed Kamyar Seyed Ghasemipour 等，《Self-Improving Embodied Foundation Models》，arXiv v1，2025-09-18。<a href="https://arxiv.org/pdf/2509.15155v1#page=2">原 PDF</a> · <a href="https://arxiv.org/abs/2509.15155v1">许可来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁去页边与正文，未改图内内容；点击放大。</figcaption>
  </figure>
  <p>先看左侧的两类监督：3B PaLI 采用 RT-2 式离散动作输出，同时从示范轨迹学习到未来目标的时间差。右下角雪花表示奖励模型冻结，避免把“自我改善”误读成策略和裁判一起无约束更新。</p>
  <p>令 d(o,g) 为剩余步数分布的期望。奖励取 d(oₜ,g) − d(oₜ₊₁,g)，小于阈值则认为成功。采集一批轨迹后计算折扣回报，用 REINFORCE 更新策略，再清空缓冲区。关键设计是把已有示范转化为稠密进度监督；奖励的可靠性仍受示范覆盖和预测误差约束。</p>
</section>

<section class="deep-section" id="evidence">
  <span class="section-index">03 / EVIDENCE</span>
  <h2>真机收益集中在 Block2Block 推物任务</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-02-self-improving-efms/policy-improvement-comparison.png"><img src="/images/paper-radar/2026-10-02-self-improving-efms/policy-improvement-comparison.png" alt="Figure 5：五组任务比较橙色监督学习与蓝色在线改善结果；真实 LanguageTable 从约 0.62–0.63 到 0.87–0.88，横轴采用 Block2Block 数据比例且有断轴。" width="2350" height="570" style="height:auto" loading="lazy" /></a>
    <figcaption>Figure 5，PDF 文件第 8 页。Seyed Kamyar Seyed Ghasemipour 等，《Self-Improving Embodied Foundation Models》，arXiv v1，2025-09-18。<a href="https://arxiv.org/pdf/2509.15155v1#page=8">原 PDF</a> · <a href="https://arxiv.org/abs/2509.15155v1">许可来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。保留全部五个面板与坐标，裁去原图注并在此补充颜色说明：橙色为监督学习，蓝色为在线改善；点击查看高清图。</figcaption>
  </figure>
  <p>重点读第二个面板：使用 20% 或 80% 示范数据初始化，随后额外采集约占完整数据集 Block2Block 轨迹数 3% 的在线数据，报告成功率由约 62–63% 到 87–88%。这个分母不是全部轨迹，更不等于算力、人力和时间仅增加 3%；横轴也有断轴。</p>
  <p>真实 LanguageTable 共三次训练运行：20% 设置两次、80% 一次，每次约 20 小时，使用三或四台机器人。图注笼统写“三个种子平均”，应连同正文脚注和附录 G 的具体运行安排理解，不能当作每个真机设置都有三次独立重复。图中无误差条，不能据此推断统计显著性。</p>
</section>

<section class="deep-section" id="limits">
  <span class="section-index">04 / LIMITS</span>
  <h2>自主奖励不等于无人值守或独立成功评测</h2>
  <p><a href="https://arxiv.org/pdf/2509.15155v1#page=24">附录 F–G</a>说明一人监看并定期复位，操作员不向模型提供成功标签；真机曲线依赖学习到的成功检测，未在该协议中清楚给出独立人工盲评的固定试验数。它支持在线训练有效的证据，但仍需警惕检测偏差。</p>
  <p>Aloha 插入实验是仿真，而且因相机看不到完全插入状态，额外添加了真实成功条件奖励，不能概括成全程无真实奖励。多模态预训练消融只替换奖励模型，策略仍从 PaLI 初始化。论文也没有证明跨本体零样本迁移或长时程技能串联；示范外失败状态是作者明确列出的难点。</p>
</section>

<section class="deep-section" id="reading">
  <span class="section-index">05 / READING</span>
  <h2>先检查奖励公式，再对照真机协议</h2>
  <p>建议用 25–35 分钟读第 3–4 页方法、第 8–10 页结果及第 24–25 页协议。追问：进度预测在失败状态是否仍准确，成功率由谁判定，同预算比较是否包含训练与复位成本？<a href="https://self-improving-efms.github.io/">作者项目页</a>提供视频和 Pointmass 教学示例，但不应把教学代码当成完整机器人训练系统已开放。</p>
</section>
