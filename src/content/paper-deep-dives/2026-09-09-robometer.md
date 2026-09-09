---
title: "Robometer：从轨迹比较学习机器人奖励"
paper_title: "Robometer: Scaling General-Purpose Robotic Reward Models via Trajectory Comparisons"
date: 2026-09-09
authors: "Anthony Liang、Yigit Korkmaz（共同一作）等"
institutions: "USC · UT Dallas · MIT · UW · Ai2 · NVIDIA"
venue: "RSS 2026"
summary: "将进度、成功判断与轨迹偏好联合训练，用失败数据改善奖励模型；重点核对它如何参与 π0 的真机强化学习，以及接入世界模型的成本。"
reading_time: "约 6 分钟"
paper_url: "https://arxiv.org/pdf/2603.02115v2"
project_url: "https://robometer.github.io/"
hero_image: "/images/paper-radar/2026-09-09-robometer/trajectory-comparison-training.png"
hero_alt: "Robometer 的三种轨迹配对方式，以及进度、成功和偏好三个预测目标"
draft: false
---

<section class="deep-section" id="verdict">
  <span class="section-index">01 / SCOPE</span>
  <h2>用失败轨迹校准奖励</h2>
  <p>Robometer 输入任务指令与视频，预测进度、是否成功及两条轨迹的优劣。它是用于策略学习的奖励模型，不直接生成动作。本文由 Codex 整理，依据 <a href="https://www.roboticsproceedings.org/rss22/p140.html" target="_blank" rel="noreferrer">RSS 2026 正式论文</a>，并使用 <a href="https://arxiv.org/abs/2603.02115" target="_blank" rel="noreferrer">2026-05-13 的 arXiv v2</a> 核对附录和原图；该工作首发于 2026-03-02。</p>
</section>

<section class="deep-section" id="problem">
  <span class="section-index">02 / PROBLEM</span>
  <h2>成功示范无法覆盖试错</h2>
  <p>成功示范可以近似按时间赋予递增进度，但机器人可能拿错物体、掉落目标，或者停在完成前。给这些失败逐帧打分很困难；判断“成功示范优于这次失败”则更容易。Robometer 利用这种比较监督，让失败轨迹参与训练，而不强迫每条轨迹都拥有密集奖励标签。</p>
</section>

<section class="deep-section" id="method">
  <span class="section-index">03 / METHOD</span>
  <h2>进度、成功与偏好联合训练</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-09-09-robometer/trajectory-comparison-training.png" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-09-09-robometer/trajectory-comparison-training.png" alt="Figure 2：三行分别比较专家与失败、不同任务、正常与倒放轨迹；右侧输出第一条轨迹的进度和成功状态，以及两条轨迹的偏好" loading="lazy" /></a>
    <figcaption>Figure 2 · <a href="https://arxiv.org/pdf/2603.02115v2#page=3" target="_blank" rel="noreferrer">PDF 文件第 3 页</a>。Anthony Liang、Yigit Korkmaz 等，<em>Robometer: Scaling General-Purpose Robotic Reward Models via Trajectory Comparisons</em>，arXiv v2。由原 PDF 渲染裁出完整图区，未改变图内内容；按 <a href="https://arxiv.org/abs/2603.02115v2" target="_blank" rel="noreferrer">arXiv 所列</a> <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 使用。点击图片查看高清版。</figcaption>
  </figure>
  <p>按三行读图：同任务中优先成功或进度更高的轨迹；不同任务中优先符合当前指令的轨迹；倒放增强让模型见到“撤销进度”。右侧 Progress 和 Success 对应第一条视频，Preference 才是在两条视频间选择。训练配对不意味着上线打分时必须同时提供一条成功示范。</p>
  <p>实现上使用 Qwen3-VL-4B，在第一条视频各帧后插入进度 token，在两条视频末尾插入偏好 token，分别连接预测头。因果掩码限制进度预测只看当前及过去；训练还包含独立的成功预测损失。每条视频抽取 8 帧，避免模型简单根据轨迹长短判断优劣。</p>
  <p>RBM-1M 汇集超过百万条轨迹，包含真机、人类视频、仿真和失败数据，覆盖 21 种机器人本体。它不是百万次全新真机采集。专家进度标签仍主要来自时间插值；偏好监督增加跨轨迹约束，没有消除这种近似。</p>
</section>

<section class="deep-section" id="evidence">
  <span class="section-index">04 / EVIDENCE</span>
  <h2>两项真机强化学习对照</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-09-09-robometer/real-robot-online-rl.png" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-09-09-robometer/real-robot-online-rl.png" alt="Figure 6：单阶段摆碗任务中基础 π0、RoboReward 和 Robometer 的成功率为 20%、55%、85%；两阶段放玉米和盖锅盖任务为 20%、20%、70%，并附真实执行画面" loading="lazy" /></a>
    <figcaption>Figure 6 · <a href="https://arxiv.org/pdf/2603.02115v2#page=8" target="_blank" rel="noreferrer">PDF 文件第 8 页</a>。Anthony Liang、Yigit Korkmaz 等，<em>Robometer: Scaling General-Purpose Robotic Reward Models via Trajectory Comparisons</em>，arXiv v2。保留两项任务、图例、数值及执行画面；原图未提供误差条。由原 PDF 渲染裁切，按 <a href="https://arxiv.org/abs/2603.02115v2" target="_blank" rel="noreferrer">arXiv 所列</a> <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 使用。点击图片查看高清版。</figcaption>
  </figure>
  <p>先比较紫色与深色柱：DROID 上以相同 π0 基础策略进行 DSRL 训练，1 万环境步后，单阶段成功率为 55% 对 85%，两阶段为 20% 对 70%；基础策略均为 20%。每条件评测 20 次，不能把这些任务上的收益推广到所有 VLA。</p>
  <p>奖励不仅塑造行为，还控制终止和阶段切换：Robometer 成功概率超过 0.6 时触发，RoboReward 则以 5/5 分触发。假阳性因此会让系统过早结束或进入下一步，比较包含了整套奖励与成功检测机制。场景仍由人重置；“自动”不代表完全无人参与。</p>
</section>

<section class="deep-section" id="limits">
  <span class="section-index">05 / LIMITS</span>
  <h2>世界模型规划仍有计算代价</h2>
  <p><a href="https://arxiv.org/pdf/2603.02115v2#page=32" target="_blank" rel="noreferrer">附录 G</a> 将奖励接入 DreamZero：从直接执行一个候选，改为生成 6 个未来视频候选并打分选择；单任务 10 次评测中成功率从 20% 到 70%。但在一张 H200 上生成并筛选一个动作块约需 28 秒，主要耗时来自世界模型。这是带额外采样预算的概念验证，不是等计算量下的纯奖励模型比较。</p>
  <p>稀疏视频采样可能漏掉长任务关键事件，视觉奖励也无法直接观测接触力或抓取稳定性。作者已有相关积累，如 Anthony Liang 的 <a href="https://aliang8.github.io/" target="_blank" rel="noreferrer">ViSaRL 与 DynaMITE-RL</a>；RSS 评审和真机对照增加可信度，但不能替代上述限制。<a href="https://robometer.github.io/" target="_blank" rel="noreferrer">项目页</a>提供代码、权重及 OOD 评测数据，完整 RBM-1M 入口仍标为 Coming Soon，不应称为已完整复现。</p>
</section>

<section class="deep-section" id="reading">
  <span class="section-index">06 / READING</span>
  <h2>先查监督构造，再查终止规则</h2>
  <p>建议读方法，约 30 分钟：从 <a href="https://arxiv.org/pdf/2603.02115v2#page=3" target="_blank" rel="noreferrer">Figure 2 与 III-B/D</a>理解训练样本，再对照 <a href="https://arxiv.org/pdf/2603.02115v2#page=8" target="_blank" rel="noreferrer">Figure 6</a> 和 <a href="https://arxiv.org/pdf/2603.02115v2#page=27" target="_blank" rel="noreferrer">附录 E 的成功检测阈值</a>。若准备复现，可从<a href="https://github.com/robometer/robometer" target="_blank" rel="noreferrer">官方代码</a>和<a href="https://huggingface.co/robometer/Robometer-4B" target="_blank" rel="noreferrer">权重</a>开始，先用自己的失败视频检验误报，再考虑接入真机优化。</p>
</section>
