---
title: "RoboArena：分散的真机比较如何组成可信排名"
paper_title: "RoboArena: Distributed Real-World Evaluation of Generalist Robot Policies"
date: 2026-10-22
authors: "Pranav Atreya、Karl Pertsch、Tony Lee 等"
institutions: "UC Berkeley、Stanford、University of Washington、Université de Montréal、NVIDIA 等"
venue: "CoRL 2025 / PMLR 305"
summary: "解释分布式双盲比较、任务感知排名，以及 4284 次真机执行构建的参考评测。"
reading_time: "约 5 分钟"
paper_url: "https://raw.githubusercontent.com/mlresearch/v305/main/assets/atreya25a/atreya25a.pdf"
project_url: "https://robo-arena.github.io/"
hero_image: "/images/paper-radar/2026-10-22-roboarena/distributed-pairwise-evaluation.png"
hero_alt: "RoboArena 将分布式评测者的成对策略偏好汇总为排名，各地可选择自己的任务和场景。"
draft: false
---

<section class="deep-section" id="problem">
  <h2>固定几张桌面，能代表通用策略吗？</h2>
  <p>少量固定任务容易复现，却未必覆盖通用策略遇到的物体、光照和指令。RoboArena 不训练新策略，而是改变评测组织方式：只在一次 A/B 比较内部匹配条件，允许不同评测者选择不同任务，再汇总相对偏好。</p>
  <p>本导读由 Codex 整理，采用<a href="https://proceedings.mlr.press/v305/atreya25a.html">CoRL 2025 / PMLR 305 正式版</a>；<a href="https://arxiv.org/abs/2506.18123">预印本首发于 2025-06-22</a>。Atreya、Pertsch、Lee 等跨机构合作，作者 <a href="https://kpertsch.github.io/">Karl Pertsch</a> 此前参与 OpenVLA、Octo 等机器人学习工作。</p>
</section>

<section class="deep-section" id="method">
  <h2>比较内部控制条件，比较之间保留多样性</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-22-roboarena/distributed-pairwise-evaluation.png"><img src="/images/paper-radar/2026-10-22-roboarena/distributed-pairwise-evaluation.png" width="1215" height="583" style="height:auto" alt="Figure 1：左侧策略池向各地评测者提供策略，中间展示抽屉、倒水等不同任务，右侧汇总成对偏好形成排名。" /></a>
    <figcaption>Figure 1，PDF 文件第 2 页。Pranav Atreya 等，《RoboArena: Distributed Real-World Evaluation of Generalist Robot Policies》，CoRL 2025 / PMLR 305 正式版。<a href="https://raw.githubusercontent.com/mlresearch/v305/main/assets/atreya25a/atreya25a.pdf#page=2">原 PDF</a> · <a href="https://proceedings.mlr.press/v305/atreya25a.html">原始发表</a> · <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">CC BY 4.0 许可来源</a>。仅裁去页边、图注和正文，点击查看高清图。</figcaption>
  </figure>
  <p>沿左到右看，关键不是中央统一搭建场景，而是各地上传可比较的策略对。右侧排名是机制示意，不是实验测得的最终分数；这张图也不代表已经覆盖不同机器人本体。</p>
  <p>服务器随机抽取两个策略，评测者不知道身份，在匹配初始条件下依次执行，并记录偏好、0–100 的最大任务进度及文字解释。任务感知排名在 Bradley–Terry 基础上加入潜在任务难度与策略—任务偏移，直接从偏好拟合，不要求人工先标注任务类别。</p>
</section>

<section class="deep-section" id="evidence">
  <h2>0.98 是排名相关，不是任务成功率</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-22-roboarena/ranking-against-oracle.png"><img src="/images/paper-radar/2026-10-22-roboarena/ranking-against-oracle.png" width="608" height="329" style="height:auto" loading="lazy" alt="Figure 4：Regular、Elo、BT、TASK、PROG 的 Pearson 相关分别为 0.69、0.90、0.97、0.98、0.98；MMRV 分别为 13、5.7、2.7、1.8、1.1%。" /></a>
    <figcaption>Figure 4，PDF 文件第 7 页。Pranav Atreya 等，同上论文，CoRL 2025 / PMLR 305 正式版。<a href="https://raw.githubusercontent.com/mlresearch/v305/main/assets/atreya25a/atreya25a.pdf#page=7">原 PDF</a> · <a href="https://proceedings.mlr.press/v305/atreya25a.html">原始发表</a> · <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">CC BY 4.0 许可来源</a>。保留两个完整坐标图，裁去相邻正文及图注；点击放大。</figcaption>
  </figure>
  <p>左图相关越高越好，右图排名违背指标 MMRV 越低越好。TASK 的 0.98、1.8% 优于标准 BT 的 0.97、2.7%，但进度平均 PROG 的 MMRV 更低，为 1.1%；不能写成 TASK 在所有指标最优。图中未画误差条，Pearson 纵轴也并非从零开始。</p>
  <p>七所机构比较七种 DROID 策略，收集 612 次成对比较；为建立参考排名，每轮额外执行其余五个策略，共 4284 次执行。这个 oracle 是该任务集合的穷举进度平均，并非真实世界的绝对排名；被评估的成对数据也来自同一集合。</p>
  <p>传统对照是 17 个任务、每策略 44 次执行。图 4 同时涉及场景覆盖与预算差异，不能单凭它隔离排名算法的因果贡献；第 8 页图 5 另按执行次数画出抽样曲线。本文不重新训练策略，也没有统一各策略预训练数据预算，不能据名次判定哪种架构在等训练资源下更强。</p>
</section>

<section class="deep-section" id="limits">
  <h2>适合发现整体差异，不替代受控消融</h2>
  <p>全部实验在 DROID 平台，尚无跨本体结论。自由选择任务会影响覆盖分布，也不便一次只改变相机角度等单一因素；恶意评测者和针对榜单过度优化的稳健性未验证。进度分数与偏好互补：同样完成任务，人仍可能偏好更快或更稳的策略。</p>
  <p>论文介绍开放评测框架，并提供<a href="https://robo-arena.github.io/">官方项目入口</a>；本次未独立验证服务可用性或完整复现链。LLM 辅助报告属于分析工具，不应替代逐段核查机器人执行视频。</p>
</section>

<section class="deep-section" id="reading">
  <h2>先读配对协议，再核对参考排名</h2>
  <p>PDF 第 4–5 页看 A/B 条件和任务感知模型；第 6–8 页核对策略池、4284 次参考评测及样本效率；第 9 页读跨本体、受控实验和评测者风险。将“策略更好”与“评测排名更可靠”分开判断。</p>
</section>
