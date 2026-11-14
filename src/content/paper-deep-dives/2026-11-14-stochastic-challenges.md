---
title: "用随机货架配置比较跨实验室的真机操控"
paper_title: "Benchmarking Real-World Robotic Manipulation through Stochastic Challenges"
date: 2026-11-14
authors: "Elias Gläßer、Gülhan Şikaroğlu、Pavlo Kupyn、Marc Pollefeys、Zuria Bauer、Hermann Blum"
institutions: "波恩大学、Lamarr Institute、苏黎世联邦理工学院、Microsoft"
venue: "CoRL 2026 已接收"
summary: "以两套移动操控系统的 568 次真机实验，解释场景覆盖、重复次数和配对设计如何影响成功率比较。"
reading_time: "约 5 分钟"
paper_url: "https://arxiv.org/pdf/2611.12804v1"
project_url: "https://rpl-bonn.github.io/stochastic-challenges/"
hero_image: "/images/paper-radar/2026-11-14-stochastic-challenges/seeded-benchmark-protocol.png"
hero_alt: "随机种子生成 KALLAX 配置，不同实验室据此搭建场景，再按种子汇总成功率。"
draft: false
---

<section class="deep-section" id="scene-sampling">
  <h2>按货架配置采样，逐层汇总成功率</h2>
  <p>Codex 整理。真机操控论文常报告任务成功率，现场布置会影响这个数字。Gläßer 等人把评测对象定义为一组可能的货架配置，并公开生成规则。每个随机种子固定门、抽屉和空格的位置，参与者可以按说明搭建同一配置，也可以从同一分布分别采样。作者团队此前开发过用于移动抓取和开抽屉的 Spot-Compose。<a href="https://arxiv.org/abs/2611.12804v1">论文与会议状态</a> · <a href="https://spot-compose.github.io/">早期真机工作</a></p>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-14-stochastic-challenges/seeded-benchmark-protocol.png"><img src="/images/paper-radar/2026-11-14-stochastic-challenges/seeded-benchmark-protocol.png" width="1007" height="454" style="height:auto" alt="左侧按随机种子生成门、抽屉和物体的配置，中间由两个实验室用不同机器人复现，右侧示意按种子比较成功率及不确定性。" /></a>
    <figcaption>Figure 2，PDF 文件第 4 页。Gläßer、Şikaroğlu、Kupyn、Pollefeys、Bauer、Blum，《Benchmarking Real-World Robotic Manipulation through Stochastic Challenges》，arXiv:2611.12804v1。裁出完整图示，可点击查看高清图。<a href="https://arxiv.org/pdf/2611.12804v1#page=4">原 PDF</a> · <a href="https://arxiv.org/abs/2611.12804v1">版本与许可标注</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></figcaption>
  </figure>
  <p>从图左向右读，先生成配置，再搭建货架、执行并记录试验，最后比较种子层面的结果。右侧的点和显著性标记用于说明流程，实测差距见 Table 2。计分时先对同一个任务的重复尝试取平均，再对同一配置内的任务取平均，最后让各配置等权，避免任务更多的货架占据更大的权重。<a href="https://arxiv.org/pdf/2611.12804v1#page=4">计分定义</a> · <a href="https://klxbench.rpl.uni-bonn.de/">配置生成器</a></p>
</section>

<section class="deep-section" id="detectable-margin">
  <h2>共享部分配置降低比较所需的差距</h2>
  <p>论文将不确定性分为重复执行的波动和配置之间的难度差异。增加同一配置内的尝试次数，只能降低前一项。当不同配置之间的差异占主导时，需要增加独立种子。若同一个配置对两套系统的难度变化大致一致，共享该配置能抵消部分波动。设计上可以保留一部分独立场景，兼顾场景覆盖与比较精度。<a href="https://arxiv.org/pdf/2611.12804v1#page=5">方差拆分与试验规划</a></p>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-14-stochastic-challenges/detectable-performance-margins.png"><img src="/images/paper-radar/2026-11-14-stochastic-challenges/detectable-performance-margins.png" width="1007" height="207" style="height:auto" alt="两行分别为开门和开抽屉，表列两套系统成功率、观测差距，以及完全独立和半共享种子设计下的最小可检测差距。" /></a>
    <figcaption>Table 2，PDF 文件第 9 页。Gläßer、Şikaroğlu、Kupyn、Pollefeys、Bauer、Blum，《Benchmarking Real-World Robotic Manipulation through Stochastic Challenges》，arXiv:2611.12804v1。裁出表题、表头与两行数据，可点击查看高清图。<a href="https://arxiv.org/pdf/2611.12804v1#page=9">原 PDF</a> · <a href="https://arxiv.org/abs/2611.12804v1">版本与许可标注</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></figcaption>
  </figure>
  <p>看抽屉这一行。两套系统的观测差距为 24.39 个百分点，完全独立采样下的最小可检测差距为 23.2 个百分点，半共享设计下估计为 18.3 个百分点。差距以显著性水平 0.10 和统计功效 80% 计算，依赖本次估计的配置方差与试验预算。论文另给出独立设计下抽屉差距的 Welch 95% 置信区间，为 4.2 至 44.6 个百分点。<a href="https://arxiv.org/pdf/2611.12804v1#page=8">区间与计算条件</a></p>
</section>

<section class="deep-section" id="hardware-scope">
  <h2>两间实验室比较的是完整移动操控系统</h2>
  <p>Spot 与 Stretch 3 采用各自的感知、导航和动作执行软件。开门分别试验 62 和 130 次，覆盖 6 和 7 个种子。开抽屉分别试验 88 和 288 次，覆盖 6 和 8 个种子。两类任务均要求至少打开 10 厘米。两套系统共完成 568 次试验，系统差距包含硬件、软件与现场条件的共同影响。共享种子由同一位研究人员在两地搭建，独立团队照说明搭建时的误差仍待量化。<a href="https://arxiv.org/pdf/2611.12804v1#page=8">真机设置与试验次数</a></p>
  <p>先读 Figure 2 与 §3.1，确认一次试验、一个任务和一个种子各占多少权重。再看 §3.2 至 §3.4，找到增加重复次数与增加种子的不同作用。最后并读 Tables 1–2 与 §6，区分不同场景子集得到的成功率、可以分辨的性能差距，以及评测暂时覆盖的两类开启动作。<a href="https://arxiv.org/pdf/2611.12804v1#page=9">两张结果表与局限</a></p>
</section>
