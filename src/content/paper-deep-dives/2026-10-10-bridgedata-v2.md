---
title: "BridgeData V2：控制数据量后，技能多样性带来什么"
paper_title: "BridgeData V2: A Dataset for Robot Learning at Scale"
date: 2026-10-10
authors: "Homer Walke、Kevin Black、Abraham Lee、Moo Jin Kim、Max Du、Chongyi Zheng、Tony Zhao、Philippe Hansen-Estruch、Quan Vuong、Andre He、Vivek Myers、Kuan Fang、Chelsea Finn、Sergey Levine"
institutions: "UC Berkeley、Stanford、Google DeepMind、CMU"
venue: "CoRL 2023"
summary: "从采集设计与等量数据对照，理解技能覆盖如何影响真实机器人泛化，并区分跨实验室与跨本体。"
reading_time: "约 5 分钟"
paper_url: "https://proceedings.mlr.press/v229/walke23a/walke23a.pdf"
project_url: "https://rail-berkeley.github.io/bridgedata/"
hero_image: "/images/paper-radar/2026-10-10-bridgedata-v2/dataset-task-environment-composition.png"
hero_alt: "BridgeData V2 的任务与环境组成：物体操作和玩具厨房占主要部分，其他技能与环境分布不均。"
draft: false
---

<section class="deep-section" id="problem">
  <h2>让同一场景包含多个可执行任务</h2>
  <p>BridgeData V2 研究真实机器人数据如何支持多任务策略和新场景泛化。其重要设计是：在同一场景采集多种可行任务，让策略必须利用语言或目标图像，不能只根据初始画面猜任务。它是与 VLA 训练直接相交的数据研究，不是新的世界模型。</p>
  <p>本导读由 Codex 整理，采用 <a href="https://proceedings.mlr.press/v229/walke23a.html">CoRL 2023 / PMLR 229</a> 当前提供的 PDF，作者及机构按 PDF 首页列出；<a href="https://arxiv.org/abs/2308.12952">预印本首发于 2023-08-24</a>。团队的持续机器人学习工作可在 Kuan Fang 的<a href="https://kuanfang.github.io/">发表记录</a>核对，包括 CoRL 2022 的 Generalization with Lossy Affordances 和 CoRL 2023 的 GRIF。</p>
</section>

<section class="deep-section" id="design">
  <h2>采集覆盖广，但分布并不均匀</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-10-bridgedata-v2/dataset-task-environment-composition.png"><img src="/images/paper-radar/2026-10-10-bridgedata-v2/dataset-task-environment-composition.png" width="1300" height="415" style="height:auto" alt="Figure 3：左侧按操作类型分组，物体操作占主要部分；右侧按环境分组，玩具厨房多于桌面、玩具水槽和其他环境。" /></a>
    <figcaption>Figure 3，PDF 文件第 5 页。Homer Walke 等，《BridgeData V2: A Dataset for Robot Learning at Scale》，CoRL 2023 / PMLR 229 所提供 PDF（2026-10-10 核验）。<a href="https://proceedings.mlr.press/v229/walke23a/walke23a.pdf#page=5">原 PDF</a> · <a href="https://proceedings.mlr.press/v229/walke23a.html">原始发表</a> · <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">PMLR 许可协议（CC BY 4.0）</a>。仅裁去页边、图注和相邻正文；点击看高清图。</figcaption>
  </figure>
  <p>先看右侧环境分布：24 个环境不等于 24 个均衡数据域，玩具厨房占明显多数；左侧也以基础物体操作为主。这张图描述训练分布，不能据此推断少样本技能已经学会。采集者每 50 条轨迹调整相机、对象和工作区，轨迹之间不强制复位，之后再补语言描述。</p>
  <p>PDF 与<a href="https://rail-berkeley.github.io/bridgedata/">作者项目页</a>均列出 50,365 条遥操作示范及 9,731 条脚本轨迹，共 60,096 条；PMLR 落地页摘要仍写 53,896 条，本文不混用两个口径。脚本抓放会失败，用户可按算法需要排除该部分。硬件为 WidowX 250，控制频率 5 Hz；采集多视角不代表每条轨迹都有完整四视角。</p>
</section>

<section class="deep-section" id="evidence">
  <h2>等量数据下比较技能覆盖</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-10-bridgedata-v2/scale-and-skill-diversity.png"><img src="/images/paper-radar/2026-10-10-bridgedata-v2/scale-and-skill-diversity.png" width="1280" height="277" style="height:auto" loading="lazy" alt="Figure 5：左图比较 ResNet 编码器容量，中图比较数据比例，右侧等量数据实验中 3 类技能和 13 类技能的成功率为 0.30 与 0.65；未显示误差条。" /></a>
    <figcaption>Figure 5，PDF 文件第 8 页。Homer Walke 等，《BridgeData V2: A Dataset for Robot Learning at Scale》，CoRL 2023 / PMLR 229 所提供 PDF（2026-10-10 核验）。<a href="https://proceedings.mlr.press/v229/walke23a/walke23a.pdf#page=8">原 PDF</a> · <a href="https://proceedings.mlr.press/v229/walke23a.html">原始发表</a> · <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">PMLR 许可协议（CC BY 4.0）</a>。保留全部三个对照面板，仅裁去页边与正文；点击放大。</figcaption>
  </figure>
  <p>右侧是最值得读的对照：用约 28k 条、3 类技能的数据，与约 27k 条、13 类技能的数据分别训练目标条件行为克隆 GCBC；一项未见抓放任务的成功率从 30% 到 65%，每策略测试 20 次。近似固定样本数后仍有收益，支持在该设置中扩展技能覆盖，而不只是重复同类示范。</p>
  <p>左侧模型容量实验只测移动勺子，中间数据规模实验测已见与未见任务。中图未见任务在后几个数据比例上持平；三个面板不能合并解释成普适缩放定律。图中没有误差条，单项小样本结果也不足以证明所有技能混合都有正迁移。</p>
</section>

<section class="deep-section" id="limits">
  <h2>跨实验室结果仍受平台与评测规模限制</h2>
  <p><a href="https://proceedings.mlr.press/v229/walke23a/walke23a.pdf#page=7">Table 4</a>在第二实验室不收新训练数据，RT-1 三任务平均成功率由 47% 变为 40%，每任务仅 10 次。这里改变的是场景、相机等条件，沿用同类机械臂，不能称为跨本体迁移。任务多数是低精度操作，未覆盖复杂力控和高速动态任务。</p>
  <p>论文比较六种方法，但 RT-1 使用更高分辨率与观测历史，其他方法输入条件不同；排名不能单独归因于 Transformer。其价值在于公开数据、训练代码和权重，以及同时检验语言条件、目标条件与离线强化学习的可用性，而非确定一个全面占优的算法。</p>
</section>

<section class="deep-section" id="reading">
  <h2>先读采集协议，再检查对照是否适用</h2>
  <p>建议用 20 分钟读 PDF 第 4 页采集协议、第 8 页 Figure 5，再回到第 6–7 页评测条件。如果用于 VLA 数据选择，优先核对任务歧义、技能比例、动作接口与失败数据处理；不要直接把这里的 65% 当作新模型或新硬件的预期成功率。数据与复现入口见<a href="https://rail-berkeley.github.io/bridgedata/">作者项目页</a>和<a href="https://github.com/rail-berkeley/bridge_data_v2">官方代码</a>。</p>
</section>
