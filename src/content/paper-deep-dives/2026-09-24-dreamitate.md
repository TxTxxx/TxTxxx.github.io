---
title: "Dreamitate：把生成视频中的工具轨迹交给真机"
paper_title: "Dreamitate: Real-World Visuomotor Policy Learning via Video Generation"
date: 2026-09-24
authors: "Junbang Liang、Ruoshi Liu、Ege Ozguroglu、Sruthi Sudhakar、Achal Dave、Pavel Tokmakov、Shuran Song、Carl Vondrick"
institutions: "Columbia University、Toyota Research Institute、Stanford University"
venue: "CoRL 2024 · PMLR 270（2025）会议版"
summary: "核对双视角视频生成、CAD 工具跟踪与四项真机评测，并说明成功标准和计算延迟。"
reading_time: "约 5 分钟"
paper_url: "https://raw.githubusercontent.com/mlresearch/v270/main/assets/liang25b/liang25b.pdf"
project_url: "https://dreamitate.cs.columbia.edu/"
hero_image: "/images/paper-radar/2026-09-24-dreamitate/stereo-video-tool-tracking.png?v=20260924"
hero_alt: "Dreamitate Figure 2：双相机记录人类工具演示，生成双视角视频后以 CAD 模型跟踪工具并执行轨迹"
draft: false
---

<section class="deep-section" id="problem">
  <span class="section-index">01 / PROBLEM</span>
  <h2>用共同工具减少人类与机器人的动作差异</h2>
  <p>Dreamitate 从人类视频学习工具的运动，再让机械臂执行同一工具的轨迹。与学习逆动力学解码器的路线相比，它把动作落地交给已知 CAD 模型的位姿跟踪和机器人控制；代价是工具、相机与任务设置都有明确要求。</p>
  <p>本文由 Codex 整理，不代表个人阅读经历或独立复现。依据 <a href="https://proceedings.mlr.press/v270/liang25b.html">PMLR 正式会议版</a>：CoRL 2024，论文集标年 2025；<a href="https://arxiv.org/abs/2406.16862">首发于 2024-06-24</a>。作者来自 Columbia、TRI、Stanford；共同作者 <a href="https://shurans.github.io/">Shuran Song 的研究记录</a>包含 Diffusion Policy、UMI 等机器人操控工作。</p>
</section>

<section class="deep-section" id="method">
  <span class="section-index">02 / METHOD</span>
  <h2>双视角生成提供画面，工具跟踪提供六维位姿</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-09-24-dreamitate/stereo-video-tool-tracking.png?v=20260924" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-09-24-dreamitate/stereo-video-tool-tracking.png?v=20260924" alt="Figure 2 完整方法图：左侧双相机人类演示用于微调视频生成器；右侧新场景双视角输入产生视频，CAD 工具跟踪将预测转换为机器人动作" loading="lazy" /></a>
    <figcaption>Figure 2 · <a href="https://raw.githubusercontent.com/mlresearch/v270/main/assets/liang25b/liang25b.pdf#page=3">PDF 文件第 3 页</a>。Junbang Liang 等，<a href="https://proceedings.mlr.press/v270/liang25b.html"><em>Dreamitate: Real-World Visuomotor Policy Learning via Video Generation</em></a>，CoRL 2024 / PMLR 270（2025）会议版。依 <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">PMLR 出版许可第 2、3 条</a>按 <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> 重用；600 dpi，保留完整图，仅裁去图外文字与原图注。点击打开高清图。</figcaption>
  </figure>
  <p>先看左侧的数据采集：人拿着可跟踪的工具示范，两台标定相机保持固定布局。Stable Video Diffusion 按任务分别微调，冻结编解码器，只调整空间和时间注意力。25 帧输出被分配给两个视角，去掉重复初始帧后形成 12 对预测帧。</p>
  <p>右侧 CAD→Track 是关键接口：MegaPose 分别估计两个视角的工具位姿，结合标定几何修正深度，再让装有对应工具的机械臂沿平滑后的轨迹运动。这里没有语言条件，也没有一个跨四任务共享的通用策略；生成视频中的人手不需要被逐关节映射到机器人。</p>
</section>

<section class="deep-section" id="evidence">
  <span class="section-index">03 / EVIDENCE</span>
  <h2>四项真机评测采用不同指标与成功标准</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-09-24-dreamitate/real-robot-task-results.png?v=20260924" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-09-24-dreamitate/real-robot-task-results.png?v=20260924" alt="Table 2 完整结果：Dreamitate 旋转、舀取、扫动分别成功 37/40、34/40、37/40 次；推形状 mIoU 为 0.731、旋转误差为 8.0 度，各项指标不能混作统一成功率" loading="lazy" /></a>
    <figcaption>Table 2 · <a href="https://raw.githubusercontent.com/mlresearch/v270/main/assets/liang25b/liang25b.pdf#page=6">PDF 文件第 6 页</a>。Junbang Liang 等，<a href="https://proceedings.mlr.press/v270/liang25b.html"><em>Dreamitate: Real-World Visuomotor Policy Learning via Video Generation</em></a>，CoRL 2024 / PMLR 270（2025）会议版。依 <a href="https://proceedings.mlr.press/pmlr-license-agreement.html">PMLR 出版许可第 2、3 条</a>按 <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> 重用；300 dpi，保留全部行列，仅裁去表外区域与原图注。点击放大。</figcaption>
  </figure>
  <p>先看前三列的分母：每项 40 次，测试物体与训练不重叠。旋转成功要求持续接触并逆时针转至少 25°；舀取只要求转移任意颗粒，扫动只要求任意一粒到目标 50 mm 内。因此 37/40 的扫动结果不表示全部颗粒清扫完成。</p>
  <p>推形状评测 32 次，报告 mIoU 和角度误差，按每次四个 rollout 中最好成绩计分；0.731 不是单次成功率。旋转、舀取、扫动、推形状分别使用 371、368、356、727 条示范，机器人分别为 xArm 7 或 UR5。这不是同一技能在两种本体上零样本迁移的验证。</p>
  <p><a href="https://raw.githubusercontent.com/mlresearch/v270/main/assets/liang25b/liang25b.pdf#page=8">Table 3</a> 的旋转消融中，去掉视频预训练从 37/40 降至 18/40；保留双视角输入但只跟踪单视角为 30/40。这支持预训练和双视角几何的作用，不能单凭主表把收益全部归因于模型规模。</p>
</section>

<section class="deep-section" id="limits">
  <span class="section-index">04 / LIMITS</span>
  <h2>相同示范预算，仍有预训练和控制方式的差异</h2>
  <p>基线使用相同示范和双视角输入，动作标签由同样的跟踪流程提取；各方法预测 12 步开环轨迹。这个对照不能代表充分闭环运行的 Diffusion Policy。视频预训练预算也不同，表中没有多训练随机种子的误差区间；少数初始化检测失败会人工修正框，作者说明双方都适用。</p>
  <p>已知刚性工具、相机标定和有限场景是前提。A100 上生成视频需 33.5 秒，位姿跟踪另需 7.5 秒，无法实时重规划；细粒度力控制也未解决。<a href="https://github.com/cvlab-columbia/dreamitate">代码仓库</a>提供旋转任务数据、微调权重和跟踪入口，但不能据此宣称四项实验均可一键复现。</p>
</section>

<section class="deep-section" id="reading">
  <span class="section-index">05 / READING</span>
  <h2>沿工具接口和评价规则阅读</h2>
  <p>建议用 25–35 分钟读方法：先读<a href="https://raw.githubusercontent.com/mlresearch/v270/main/assets/liang25b/liang25b.pdf#page=3">第 3–4 页生成与跟踪</a>，再核对第 5–8 页成功定义及限制，最后读<a href="https://raw.githubusercontent.com/mlresearch/v270/main/assets/liang25b/liang25b.pdf#page=12">附录第 12–13 页</a>的标定与基线实现。与 RoboDreamer 对照时，重点比较工具几何跟踪和学习动作解码器各自省掉了什么、又要求什么。</p>
</section>
