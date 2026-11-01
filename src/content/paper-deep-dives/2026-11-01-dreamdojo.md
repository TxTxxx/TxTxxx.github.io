---
title: "DreamDojo：潜在动作怎样连接人类视频与机器人预测"
paper_title: "DreamDojo: A Generalist Robot World Model from Large-Scale Human Videos"
date: 2026-11-01
authors: "Shenyuan Gao、William Liang 等（完整作者见会议原文）"
institutions: "NVIDIA、HKUST、UC Berkeley、University of Washington、Stanford、KAIST、University of Toronto、UC San Diego、UT Austin"
venue: "ICML 2026"
summary: "解释潜在动作预训练、目标机器人适配与蒸馏，核对装袋规划收益、乐观评估和公开实现疑点。"
reading_time: "约 5 分钟"
paper_url: "https://raw.githubusercontent.com/mlresearch/v306/main/assets/gao26q/gao26q.pdf"
project_url: "https://dreamdojo-world.github.io/"
hero_image: "/images/paper-radar/2026-11-01-dreamdojo/latent-action-bottleneck-and-retrieval.png"
hero_alt: "DreamDojo 的潜在动作编码器将连续两帧压缩为动作向量，解码器结合前一帧预测后一帧，右侧展示相似潜在动作检索。"
draft: false
---

<section class="deep-section" id="problem">
  <h2>从视频中的变化学习动作代理，再适配机器人控制</h2>
  <p>人类视频覆盖的交互比机器人示范丰富，却缺少关节控制标签。DreamDojo 从相邻帧学习连续潜在动作，以此预训练动作条件视频模型，再用目标机器人数据重新学习控制接口。新机器人仍需后训练，不能把这里的跨本体知识迁移理解为零样本控制。</p>
  <p>本导读由 Codex 整理，固定采用<a href="https://proceedings.mlr.press/v306/gao26q.html">ICML 2026／PMLR 306 会议版</a>；其作者列表和部分数值与<a href="https://arxiv.org/abs/2602.06949">2026-02-06 的预印本</a>不同。Gao、Liang 来自 NVIDIA 与高校合作团队；Jang、Ye、Zhu、Fan 等此前共同参与<a href="https://proceedings.mlr.press/v305/jang25a.html">CoRL 2025 的 DreamGen</a>，已有相关视频与机器人学习工作。</p>
</section>

<section class="deep-section" id="method">
  <h2>用信息瓶颈提取动作，分三阶段训练世界模型</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-01-dreamdojo/latent-action-bottleneck-and-retrieval.png"><img src="/images/paper-radar/2026-11-01-dreamdojo/latent-action-bottleneck-and-retrieval.png" width="1080" height="495" style="height:auto" alt="Figure 3：左侧编码器读取连续两帧并输出潜在动作，解码器结合前一帧重建后一帧；右侧两组检索结果展示不同场景、人手和机器人中相似潜在动作对应的帧对，保留所有子图。" /></a>
    <figcaption>Figure 3，PDF 文件第 5 页。Shenyuan Gao、William Liang 等，《DreamDojo: A Generalist Robot World Model from Large-Scale Human Videos》，ICML 2026／PMLR 306:33340–33366 会议版。<a href="https://proceedings.mlr.press/v306/gao26q.html">原始发表</a> · <a href="https://raw.githubusercontent.com/mlresearch/v306/main/assets/gao26q/gao26q.pdf#page=5">原 PDF</a> · <a href="https://proceedings.mlr.press/pmlr-license-agreement.pdf">PMLR 许可来源（第 2–3 条）</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁去页边、图注和相邻内容，保留完整图；点击查看高清图。</figcaption>
  </figure>
  <p>先看左侧：瓶颈限制后帧信息只能经紧凑向量传入，推动它保留动作相关变化。右侧展示相似向量检索到的跨场景帧对，属于表征的定性证据，不能单独证明已分离出完整物理动作。</p>
  <p>潜在动作是 32 维 VAE 表征。世界模型从 Cosmos-Predict2.5 初始化，在总计 44,711 小时人类视频上预训练；每四步动作组成块，送入对应视频潜变量。适配时重置动作条件层，并以目标机器人相对动作更新全模型；之后把教师蒸馏为带短上下文的因果学生，减少去噪步数。</p>
</section>

<section class="deep-section" id="planning">
  <h2>装袋规划提升 5.33 个百分点，需读清计分方式</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-01-dreamdojo/fruit-packing-planning-results.png"><img src="/images/paper-radar/2026-11-01-dreamdojo/fruit-packing-planning-results.png" width="875" height="590" style="height:auto" loading="lazy" alt="Figure 5 完整规划结果：五个策略检查点依次为 34.67%、38.67%、41.33%、48.00%、62.67%，DreamDojo 选择动作为 68.00%；红色虚线是均匀采样 55.33%，保留纵轴、刻度、策略名称和全部数值。" /></a>
    <figcaption>Figure 5，PDF 文件第 8 页。Shenyuan Gao、William Liang 等，同上论文，ICML 2026／PMLR 306 会议版。<a href="https://proceedings.mlr.press/v306/gao26q.html">原始发表</a> · <a href="https://raw.githubusercontent.com/mlresearch/v306/main/assets/gao26q/gao26q.pdf#page=8">原 PDF</a> · <a href="https://proceedings.mlr.press/pmlr-license-agreement.pdf">PMLR 许可来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。裁去页边、图注和相邻内容，保留完整坐标、基线与所有柱；点击查看高清图。</figcaption>
  </figure>
  <p>比较绿色柱与最高灰柱，再看红色采样基线：68.00% 相对最佳单策略 62.67% 提升 5.33 个百分点，相对均匀采样 55.33% 提升 12.67 个百分点。图中未给误差条；不能把这组结果写成任务成功率翻倍。</p>
  <p>系统在 10 种 AgiBot 水果装袋场景中，让五个策略检查点提出动作，以世界模型预测候选未来，再用外部 DINOv2 价值模型选择。价值模型需要子任务边界监督，收益来自整套候选与评分流程。论文未清楚报告主图的总试验次数和置信区间；附录另报 37%／43%／70%，未说明与主图的设置对应关系，不宜合并。</p>
  <p>附录的策略评估覆盖 20 个场景、每次约 80 秒，按入袋水果数计分，五个水果为满分；因此不应把百分数直接解释为完整任务的二值成功概率。六个检查点的模拟与真实分数相关系数为 0.995，但模拟绝对分数偏高，排序一致不代表失败率已校准。</p>
</section>

<section class="deep-section" id="limits">
  <h2>速度、失败覆盖和公开实现仍限制实际用途</h2>
  <p>会议版在 H100 上报告学生 10.93 FPS、教师 2.72 FPS，评估为一分钟视频；学生 LPIPS 从教师的 0.412 变为 0.485，存在质量代价。视频生成速度不等于策略控制频率。模型也未自然支持多视角，对拍打、快速挥手及细微失败仍不可靠。</p>
  <p><a href="https://github.com/NVIDIA/DreamDojo">官方代码与权重入口</a>已开放。截至本次核查，<a href="https://github.com/NVIDIA/DreamDojo/issues/19">Issue #19</a>报告时间损失索引疑点，<a href="https://github.com/NVIDIA/DreamDojo/issues/23">Issue #23</a>报告潜在动作的批次／时间重排疑点，均未见作者澄清。本次未独立复现实验，这些报告应作为实现版本与复现风险核对项，不能直接据此判定所有论文结果失效。</p>
</section>

<section class="deep-section" id="reading">
  <h2>先检查代理动作，再追踪规划指标与实现版本</h2>
  <p>PDF 第 4–6 页读动作接口和三阶段训练；第 7–9 页读对照、规划与速度；第 15–16 页查训练规模、试验和计分；第 19、23 页分别核对额外规划实验与价值模型。复现前再对照官方问题讨论，区分人类数据预训练、机器人适配和外部评分各自带来的收益。</p>
</section>
