---
title: "TactAlign：把人类触觉示范迁移给机器人"
paper_title: "TactAlign: Human-to-Robot Policy Transfer via Tactile Alignment"
date: 2026-09-15
authors: "Youngsun Wi、Jessica Yin、Elvis Xiang、Akash Sharma、Jitendra Malik、Mustafa Mukadam、Nima Fazeli、Tess Hellebrekers"
institutions: "University of Michigan、NVIDIA、Amazon Frontier AI & Robotics、UC Berkeley、University of Washington、Microsoft Research（按 arXiv v1）"
venue: "RSS 2026 · 本页解读 arXiv v1"
summary: "从伪配对、触觉特征对齐到动作策略共训练，核对跨传感器迁移的证据，以及零样本结果背后的数据条件。"
reading_time: "约 7 分钟"
paper_url: "https://arxiv.org/pdf/2602.13579v1"
project_url: "https://yswi.github.io/tactalign/"
hero_image: "/images/paper-radar/2026-09-15-tactalign/tactile-encoder-flow-alignment.png"
hero_alt: "TactAlign Figure 2：先分别训练人类与机器人触觉编码器，再用伪配对监督 rectified flow 对齐两种潜在表示"
draft: false
---

<section class="deep-section" id="scope">
  <span class="section-index">01 / SCOPE</span>
  <h2>触觉维度一致，不代表接触含义一致</h2>
  <p>人用触觉手套演示动作，机器人却装着不同的指尖传感器。把两边的数据直接交给同一个策略，接触强度和滑动信号可能含义不一致。TactAlign 先对齐触觉表示，再训练共享动作策略；它是跨本体策略学习方法，本身不是 VLA 或世界模型。</p>
  <p>本文由 Codex 整理，依据 <a href="https://arxiv.org/abs/2602.13579v1" target="_blank" rel="noreferrer">2026-02-14 的 arXiv v1</a>，发表状态由 <a href="https://www.roboticsproceedings.org/rss22/p006.html" target="_blank" rel="noreferrer">RSS 2026 正式论文集</a>确认。作者与单位按该 PDF 首页记录，部分工作完成于 Youngsun Wi 的 Meta FAIR 实习期间；以下实验均为论文报告，未独立复现。</p>
</section>

<section class="deep-section" id="method">
  <span class="section-index">02 / METHOD</span>
  <h2>分别编码，再用伪配对学习映射</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-09-15-tactalign/tactile-encoder-flow-alignment.png" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-09-15-tactalign/tactile-encoder-flow-alignment.png" alt="Figure 2 完整方法图：蓝色 Xela 机器人分支与粉色 OSMO 手套分支分别学习触觉表示；右侧冻结编码器，以人机伪配对训练紫色流映射模块" loading="lazy" /></a>
    <figcaption>Figure 2 · <a href="https://arxiv.org/pdf/2602.13579v1#page=3" target="_blank" rel="noreferrer">arXiv v1，PDF 文件第 3 页</a>。Youngsun Wi 等，<em>TactAlign: Human-to-Robot Policy Transfer via Tactile Alignment</em>。依据 <a href="https://arxiv.org/abs/2602.13579v1" target="_blank" rel="noreferrer">arXiv 许可声明</a>，原图及本摘录按 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a> 用于非商业导读。300 dpi 渲染，仅裁去图外区域，保留完整图与原图注，未改图内内容。点击查看高清版。</figcaption>
  </figure>
  <p>先看蓝、粉两个分支：OSMO 手套与 Xela 指尖信号分别编码，利用重建目标保留各自结构，再通过注意力池化得到同维特征。实验硬件是 Franka Panda 加 Allegro Hand；两类触觉信号的空间分辨率分别为 1×3 和 30×3。</p>
  <p>右侧的监督来自运动，而非逐帧配好的触觉真值。系统比较归一化手指与物体位姿、运动变化，找近邻，再过滤接触状态不一致的候选。rectified flow 在这些粗对应的引导下，学习从手套特征到机器人特征的连续变换。</p>
  <p>“无需严格配对”仍有条件：构造对应的示范须来自相同任务、物体和相近起止状态，且需要视觉估计物体姿态。附录使用手部估计、分割、自动重建和位姿跟踪流程，并非任意两堆触觉数据都能对齐。随后冻结编码器和映射，用对齐触觉与本体感觉训练 ACT 式动作分块策略。</p>
</section>

<section class="deep-section" id="evidence">
  <span class="section-index">03 / EVIDENCE</span>
  <h2>区分对齐收益与新增数据收益</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-09-15-tactalign/cotraining-task-object-results.png" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-09-15-tactalign/cotraining-task-object-results.png" alt="Table I 完整真机结果：对比机器人数据单独训练、无触觉、无对齐与完整 TactAlign；列按三种任务及人机都见过、仅人见过、双方都未见过的物体分组，汇总成功率分别为 38、21、28、79 百分比" loading="lazy" /></a>
    <figcaption>Table I · <a href="https://arxiv.org/pdf/2602.13579v1#page=6" target="_blank" rel="noreferrer">arXiv v1，PDF 文件第 6 页</a>。Youngsun Wi 等，<em>TactAlign: Human-to-Robot Policy Transfer via Tactile Alignment</em>。依据 <a href="https://arxiv.org/abs/2602.13579v1" target="_blank" rel="noreferrer">arXiv 许可声明</a>，原表及本摘录沿用 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>。300 dpi，保留全部行列与原表注，仅裁去表外区域。单位为成功率 %，越高越好；此表未给置信区间。点击查看高清版。</figcaption>
  </figure>
  <p>先比较 w/o Align 与完整方法：二者都使用人机数据，汇总值从 28% 到 79%，更接近对齐机制的对照。Robot Only 为 38%，但这个对比还同时改变了训练数据量与物体覆盖，不能把差距全归于流映射。</p>
  <p>79% 可由表中九个“任务×物体类别”单元格等权平均复得，不是将全部试验直接合并。<a href="https://arxiv.org/pdf/2602.13579v1#page=8" target="_blank" rel="noreferrer">Table II</a>按具体物体平均的三项成绩是 76%、72%、74%。每个物体仅测试 10 次，未报告多训练种子的区间，结果支持该设置中的收益，不是高可靠性保证。</p>
  <p>右侧盖盖子任务未用于触觉对齐，但其策略仍使用该任务的人机示范。不能把“对齐模块迁移到新任务”读成“策略不见新任务数据就会执行”。</p>
</section>

<section class="deep-section" id="data">
  <span class="section-index">04 / DATA</span>
  <h2>零样本不等于整条流程没有机器人数据</h2>
  <p>对齐阶段用了翻转和插接两类任务的 100 条机器人、200 条人类示范；编码器还用了约 10 分钟自由交互数据。共训练每项任务用 50 条机器人及 140–160 条人类示范。“约 5 分钟”指为一个新增物体采集的 20 条人类示范，不是全部数据预算。</p>
  <p>拧灯泡另用 20 条人类示范，复用此前的触觉对齐，不采集该任务的机器人示范。<a href="https://arxiv.org/pdf/2602.13579v1#page=8" target="_blank" rel="noreferrer">Table III</a>报告 10 次测试全部成功，无触觉、无对齐均为 0/10；腕部固定等任务约束和小样本规模限制了结论，不能外推到任意灵巧操作。</p>
</section>

<section class="deep-section" id="reading">
  <span class="section-index">05 / READ NEXT</span>
  <h2>先核对对应条件，再考虑接入更大策略</h2>
  <p>建议读方法，约 25 分钟：从<a href="https://arxiv.org/pdf/2602.13579v1#page=3" target="_blank" rel="noreferrer">第 3–4 页的伪配对与策略输入</a>开始，接着核对<a href="https://arxiv.org/pdf/2602.13579v1#page=5" target="_blank" rel="noreferrer">第 5 页数据预算</a>、第 6/8 页结果，最后看<a href="https://arxiv.org/pdf/2602.13579v1#page=12" target="_blank" rel="noreferrer">附录 B 的姿态与信号处理</a>。论文只验证一种手套—机器人组合，没有解决视觉域差异，也未证明接入大规模 VLA 后的收益。</p>
  <p>截至 2026-09-15，<a href="https://yswi.github.io/tactalign/" target="_blank" rel="noreferrer">项目页</a>仍将代码入口标为 Coming Soon，该入口返回 404，暂不能核验公开实现。复现前应确认数据与标定流程是否开放，不能只按流网络本身的训练成本估算工程投入。</p>
</section>
