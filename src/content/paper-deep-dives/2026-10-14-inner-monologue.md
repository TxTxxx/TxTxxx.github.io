---
title: "Inner Monologue：用执行反馈更新语言计划"
paper_title: "Inner Monologue: Embodied Reasoning through Planning with Language Models"
date: 2026-10-14
authors: "Wenlong Huang、Fei Xia、Ted Xiao 等（前三位共同一作）"
institutions: "Robotics at Google"
venue: "CoRL 2022 / PMLR 205"
summary: "核对反馈进入规划器的路径、厨房消融结果，以及人工感知与预训练技能带来的适用边界。"
reading_time: "约 5 分钟"
paper_url: "https://proceedings.mlr.press/v205/huang23c/huang23c.pdf"
project_url: "https://innermonologue.github.io/"
hero_image: "/images/paper-radar/2026-10-14-inner-monologue/language-feedback-loop.png"
hero_alt: "Inner Monologue 用场景描述、人工回答和成功检测形成语言反馈，失败后重新选择动作。"
draft: false
---

<section class="deep-section" id="problem">
  <h2>已选过的动作，需要执行结果来校正</h2>
  <p>语言规划器如果把“抓取可乐”写进历史就默认成功，后续计划可能继续沿用错误状态。Inner Monologue 在每步后追加成功检测和场景反馈，使冻结的语言模型能重新决定动作。它研究高层技能规划，不直接学习新的动作策略，也没有预测未来物理状态的 world model。</p>
  <p>本导读由 Codex 整理，依据<a href="https://proceedings.mlr.press/v205/huang23c.html">CoRL 2022 正式论文</a>及补充材料。原文署名 Robotics at Google；共同一作 Wenlong Huang 的<a href="https://wenlonghuang.com/">研究记录</a>还包括 ICML 2022 语言规划、CoRL 2023 VoxPoser 等相关工作。论文<a href="https://arxiv.org/abs/2207.05608">首发于 2022-07-12</a>，PMLR 正式卷为 205。</p>
</section>

<section class="deep-section" id="method">
  <h2>反馈以文字追加，动作仍由已有技能执行</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-14-inner-monologue/language-feedback-loop.png"><img src="/images/paper-radar/2026-10-14-inner-monologue/language-feedback-loop.png" width="1220" height="540" style="height:auto" alt="Figure 1：场景描述提供可见饮料，机器人询问人的偏好；抓取失败反馈触发再次抓取，成功后再执行递送。右侧列出移动操作、仿真桌面和真实桌面环境。" /></a>
    <figcaption>Figure 1，PDF 文件第 2 页。Wenlong Huang、Fei Xia、Ted Xiao 等，《Inner Monologue: Embodied Reasoning through Planning with Language Models》，CoRL 2022 / PMLR 205 正式版。<a href="https://proceedings.mlr.press/v205/huang23c/huang23c.pdf#page=2">原 PDF</a> · <a href="https://proceedings.mlr.press/v205/huang23c.html">原始发表</a> · <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">CC BY 4.0 许可来源</a>。仅裁去页边、原图注和相邻正文，点击查看高清图。</figcaption>
  </figure>
  <p>先看左侧重复的抓取动作：中间的失败反馈改变下一步选择，而成功后才继续递送。反馈分为技能成功与否、定期提供的物体或任务进度描述，以及规划器提问后获得的回答；本文主动问答实验由人回答，不应把示意图当成全自动系统证明。</p>
  <p>三种环境使用不同组件：桌面采用 InstructGPT，厨房采用 540B PaLM，并保留 SayCan 的价值函数可执行性约束。厨房成功检测比较初始与结束图像及技能文字；补充材料还用另一模型判断实际完成了哪项技能，减少误报。语言模型不微调，但检测器和低层技能仍需训练。</p>
</section>

<section class="deep-section" id="evidence">
  <h2>厨房消融支持反馈有效，也暴露人工信息的贡献</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-10-14-inner-monologue/kitchen-feedback-ablation.png"><img src="/images/paper-radar/2026-10-14-inner-monologue/kitchen-feedback-ablation.png" width="1028" height="630" style="height:auto" loading="lazy" alt="Table 3：按有无人工扰动比较三类厨房任务，SayCan、仅成功反馈、物体加成功反馈的总计成功率分别为 30.8%、48.7%、60.4%；受扰动移动操作一行为 0%、25%、75%。" /></a>
    <figcaption>Table 3，PDF 文件第 7 页。Wenlong Huang、Fei Xia、Ted Xiao 等，同上论文，CoRL 2022 / PMLR 205 正式版。<a href="https://proceedings.mlr.press/v205/huang23c/huang23c.pdf#page=7">原 PDF</a> · <a href="https://proceedings.mlr.press/v205/huang23c.html">原始发表</a> · <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">CC BY 4.0 许可来源</a>。保留完整表格，裁去相邻 Figure 4、图注和正文；点击放大核对。</figcaption>
  </figure>
  <p>表中总计依次为 30.8%、48.7%、60.4%。最值得对照的是扰动下的移动操作：0%、25%、75%；但抽屉任务加入物体反馈后仍为 44.4%，并非所有任务继续获益。厨房 Object 来自人工观察，Success 来自学习的检测器，因此最后一列同时增加了高质量外部信息。</p>
  <p>正文称厨房评测有 120 次、覆盖八条指令和三类任务，并区分有无人工对抗扰动；主表未列每格次数或误差，不自行反推。这里的 SayCan 30.8% 不能与其原论文另一套任务的 74% 直接比较。真实桌面另有两项任务、表注明 10 次运行，组合反馈总计 90%，但不足以证明开放环境可靠性。</p>
</section>

<section class="deep-section" id="limits">
  <h2>感知错误和技能边界仍会限制恢复</h2>
  <p><a href="https://proceedings.mlr.press/v205/huang23c/huang23c-supp.pdf#page=3">补充材料第 3 页</a>说明厨房技能来自 68,000 条遥操作示范和 12,000 条自主成功轨迹，采集历时 11 个月、使用 10 台机器人；导航还使用真实地图。仿真桌面原语另用 20,000 条示范。无新增语言模型训练不等于无数据成本。</p>
  <p>成功误报会让规划器沿错误状态继续，漏报会引起无效重试；原文还观察到模型忽略反馈。三种环境各自配置模型与技能，没有证明同一策略跨本体迁移。<a href="https://innermonologue.github.io/">项目页</a>提供视频，正式补充材料给出提示与实现细节；未在这些官方入口找到完整训练代码发布，不填写代码链接。</p>
</section>

<section class="deep-section" id="reading">
  <h2>先核对反馈来源，再判断提升来自哪里</h2>
  <p>约 25 分钟：读主 PDF 第 3–4 页反馈定义、第 6–8 页真机结果与局限，再查补充 PDF 第 1–4 页模块和数据。桌面扰动参数在正文与补充材料中写法不一致，不宜混合引用。与 SayCan 对读时，重点分清“动作执行前的可执行性评分”和“执行后的结果反馈”。</p>
</section>
