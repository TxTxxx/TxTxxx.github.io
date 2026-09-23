---
title: "RoboDreamer：拆分语言条件，组合视频计划"
paper_title: "RoboDreamer: Learning Compositional World Models for Robot Imagination"
date: 2026-09-23
authors: "Siyuan Zhou、Yilun Du、Jiaben Chen、Yandong Li、Dit-Yan Yeung、Chuang Gan"
institutions: "HKUST、MIT、UC San Diego、University of Central Florida、UMass Amherst"
venue: "ICML 2024 · PMLR 235 会议版"
summary: "从扩散条件的组合机制，到六项仿真操控结果，区分生成视频评分与机器人执行成功率。"
reading_time: "约 5 分钟"
paper_url: "https://raw.githubusercontent.com/mlresearch/v235/main/assets/zhou24f/zhou24f.pdf"
project_url: "https://robovideo.github.io/"
hero_image: "/images/paper-radar/2026-09-23-robodreamer/compositional-video-generation.png"
hero_alt: "RoboDreamer Figure 3：语言分解后，各条件对同一带噪视频的预测共同引导生成"
draft: false
---

<section class="deep-section" id="problem">
  <span class="section-index">01 / PROBLEM</span>
  <h2>学过动作和位置，能否理解它们的新组合？</h2>
  <p>RoboDreamer 把整条指令拆成动作、物体与空间关系短语，让视频生成器组合这些条件，再把预测画面转换成机器人动作。它研究已知语义成分的新组合，而非任意新物体、新动作或跨本体零样本控制。</p>
  <p>本文由 Codex 整理，不代表个人阅读经历或独立复现。依据 <a href="https://proceedings.mlr.press/v235/zhou24f.html">ICML 2024 的 PMLR 会议版</a>；<a href="https://arxiv.org/abs/2404.12377">arXiv 首发于 2024-04-18</a>。作者与机构按论文署名列出；Yilun Du 等人的相关研究记录还包括 <a href="https://embodied-minds-lab.github.io/publications/">UniPi、HiP</a>，但团队积累不能代替本文的实验检验。</p>
</section>

<section class="deep-section" id="method">
  <span class="section-index">02 / METHOD</span>
  <h2>组合的是去噪预测，不是拼接几段视频</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-09-23-robodreamer/compositional-video-generation.png" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-09-23-robodreamer/compositional-video-generation.png" alt="Figure 3：指令解析成多个短语，短语和可选目标图像分别条件化同一带噪视频；组合噪声预测后逐步生成未来帧" loading="lazy" /></a>
    <figcaption>Figure 3 · <a href="https://raw.githubusercontent.com/mlresearch/v235/main/assets/zhou24f/zhou24f.pdf#page=3">PDF 文件第 3 页</a>。Siyuan Zhou 等，<a href="https://proceedings.mlr.press/v235/zhou24f.html"><em>RoboDreamer: Learning Compositional World Models for Robot Imagination</em></a>，ICML 2024 / PMLR 235 会议版。依 <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">PMLR 出版许可第 2、3 条</a>按 <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> 重用。300 dpi，仅裁去图外文字与原图注，保留完整图。点击放大。</figcaption>
  </figure>
  <p>从左到右看：句法解析器与规则提取动作短语、介词短语；每个条件面对同一份带噪视频，模型的噪声预测随后合成，共同约束整段生成。训练还随机选取条件子集，避免只记住完整句子。目标图像或草图可以作为额外条件接入，但这增加了任务信息。</p>
  <p>模型使用冻结的 T5-XXL 文本编码器与级联视频扩散，生成八帧画面并逐级放大至 256×256。控制时，逆动力学模型根据相邻预测帧和当前状态输出动作，执行后重新观察、生成；语言分解本身并不保证动作可执行或时序一致。</p>
</section>

<section class="deep-section" id="evidence">
  <span class="section-index">03 / EVIDENCE</span>
  <h2>视频看起来完成了任务，不等于机器人完成了任务</h2>
  <p>RT-1 部分使用约七万条真实机器人示范、约五百种任务训练视频生成。<a href="https://raw.githubusercontent.com/mlresearch/v235/main/assets/zhou24f/zhou24f.pdf#page=5">Table 1</a> 中未见指令得分 81.3%，是评审者对生成视频的判断，不是真机执行率。评估约 128 个视频、覆盖二十余条提示，每个样本至少三位评审；无解析器版本为 68.8%，支持分解条件在该设置中的作用。</p>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-09-23-robodreamer/rlbench-execution-results.png" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-09-23-robodreamer/rlbench-execution-results.png" alt="Table 3 完整六任务结果：RoboDreamer 平均成功率 49.3%，UniPi 41.0%；RoboDreamer 堆块 18.5%、取鞋 10.5%，开灯和抬块未超过 Hiveformer" loading="lazy" /></a>
    <figcaption>Table 3 · <a href="https://raw.githubusercontent.com/mlresearch/v235/main/assets/zhou24f/zhou24f.pdf#page=8">PDF 文件第 8 页</a>。Siyuan Zhou 等，<a href="https://proceedings.mlr.press/v235/zhou24f.html"><em>RoboDreamer: Learning Compositional World Models for Robot Imagination</em></a>，ICML 2024 / PMLR 235 会议版。依 <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">PMLR 出版许可第 2、3 条</a>按 <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> 重用。300 dpi，保留全部行列，裁去表外文字与原图注；数值单位为成功率百分比。点击查看高清表。</figcaption>
  </figure>
  <p>控制证据来自 RLBench 仿真：先看最右平均值，再看堆块、取鞋两列。49.3% 比 UniPi 的 41.0% 高 8.3 个百分点，但复杂任务仍很弱；开灯、抬块也并非最优。这只是表中六项任务，不是整个 RLBench 的七十四项平均，更不是实机部署验证。</p>
</section>

<section class="deep-section" id="limits">
  <span class="section-index">04 / LIMITS</span>
  <h2>比较条件与可复现性仍有限</h2>
  <p>表 3 未报告每任务试验次数和误差区间。Hiveformer 使用多视角与历史，RoboDreamer 使用前视 RGB；UniPi 对照基于公开 AVDC 代码实现，不能视作完全同等配置。加入目标图像后的更高视频评分，也不能单独归因于语言组合方法。</p>
  <p>训练约用一百张 V100，但未给出完整 GPU 小时预算。<a href="https://github.com/rainbow979/robodreamer">官方仓库</a>提供训练入口和数据示例，README 未列出预训练权重或完整 RLBench 复现流程。论文没有证明动作条件反事实预测、三维物理一致性或真实机器人长时程可靠性；“world model”在这里应结合具体能力理解。</p>
</section>

<section class="deep-section" id="reading">
  <span class="section-index">05 / READING</span>
  <h2>先读组合公式，再核对评分对象</h2>
  <p>建议用 25–35 分钟读方法：从<a href="https://raw.githubusercontent.com/mlresearch/v235/main/assets/zhou24f/zhou24f.pdf#page=3">第 3–4 页 Figure 3 与条件组合公式</a>入手，再看<a href="https://raw.githubusercontent.com/mlresearch/v235/main/assets/zhou24f/zhou24f.pdf#page=8">第 8 页 Table 3</a>及附录实现。可追问：收益来自语言结构、生成质量还是动作解码？现有消融只回答其中一部分。</p>
</section>
