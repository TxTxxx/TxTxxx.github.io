---
title: "Video Language Planning：视频树搜索怎样连接子目标与机器人执行"
paper_title: "Video Language Planning"
date: 2026-11-06
authors: "Yilun Du 等 13 位作者（完整署名见原文）"
institutions: "Google DeepMind、MIT、UC Berkeley（论文发表时机构）"
venue: "ICLR 2024"
summary: "解释语言候选、视频动力学与启发式搜索，区分视频计划、仿真执行及真机示例的证据。"
reading_time: "约 5 分钟"
paper_url: "https://arxiv.org/pdf/2310.10625v1"
project_url: "https://video-language-planning.github.io/"
hero_image: "/images/paper-radar/2026-11-06-video-language-planning/language-video-tree-search-and-control.png"
hero_alt: "VLP Figure 1：左侧 PaLM-E 提出语言动作并估计剩余步数，右侧视频模型预测后果，中间树搜索选择分支，再由图像目标条件策略执行。"
draft: false
---

<section class="deep-section" id="planning-question">
  <h2>预测未来之后，还要搜索和执行</h2>
  <p>Video Language Planning 把长任务拆成语言子目标，用视频模型预测每种选择的后果，再搜索能推进目标的视觉计划。视频不直接充当关节指令：独立的图像目标条件策略读取当前观测和计划帧，输出控制动作。</p>
  <p>本导读由 Codex 整理，采用<a href="https://arxiv.org/abs/2310.10625v1">2023-10-16 arXiv v1</a>；<a href="https://proceedings.iclr.cc/paper_files/paper/2024/hash/848784373188ddf641079524e89e0ac9-Abstract-Conference.html">ICLR 2024 正式记录</a>确认发表，会议版表 2 的主要数值也已核对。作者发表时来自 Google DeepMind、MIT 与 Berkeley；<a href="https://yilundu.github.io/">Du 的研究记录</a>包含 UniPi 和后续 Large Video Planner，形成了视频生成与机器人规划的持续研究线。</p>
</section>

<section class="deep-section" id="search-mechanism">
  <h2>语言提出分支，视频展开后果，启发式函数选方向</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-06-video-language-planning/language-video-tree-search-and-control.png"><img src="/images/paper-radar/2026-11-06-video-language-planning/language-video-tree-search-and-control.png" width="1665" height="964" style="height:auto" alt="Figure 1 完整方法图：左上 VLM 根据图像与任务生成语言动作，右上文本条件视频模型预测短视频，左下 VLM 估计距离完成还剩多少步，中间比较和延伸视频分支，右下目标条件策略从当前图像与目标图像输出机器人动作。" /></a>
    <figcaption>Figure 1，PDF 文件第 2 页。Yilun Du 等，《Video Language Planning》，arXiv:2310.10625v1，2023-10-16。<a href="https://arxiv.org/pdf/2310.10625v1#page=2">原 PDF</a> · <a href="https://arxiv.org/abs/2310.10625v1">许可标注来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁去页边、图注及相邻正文，保留完整方法图；点击查看高清图。</figcaption>
  </figure>
  <p>沿左右箭头看中央分支：VLM 提出 A 个语言动作，每个动作生成 D 段候选视频，再按“距完成还剩多少步”的负值选择。系统维持 B 条并行计划，每五轮用最佳计划替换最差计划，属于并行爬山式树搜索，不是穷举所有未来。</p>
  <p>同一个微调的 12B PaLM-E 同时学习动作提议和剩余步数预测。视频扩散模型每次生成 16 帧；图像目标条件策略训练仍需要动作标签。执行若干步后，系统用实际观测重新规划，以减少生成误差与控制偏差累积。</p>
  <p>搜索也会利用模型漏洞：物体瞬移到目标处可能获得虚假的高分。作者丢弃启发式分数单次改善过大的视频，阈值依样例手调；这只能缓解漏洞，不能保证物理可行。</p>
</section>

<section class="deep-section" id="execution-evidence">
  <h2>64%、92%、16% 是仿真整任务完成率</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-06-video-language-planning/simulated-long-horizon-execution-comparison.png"><img src="/images/paper-radar/2026-11-06-video-language-planning/simulated-long-horizon-execution-comparison.png" width="1658" height="360" style="height:auto" loading="lazy" alt="Table 2 完整仿真执行表：移动到区域、按颜色分组、排成直线三类任务分别列 Reward 与 Completion；VLP 完成率为 64%、92%、16%，保留 UniPi、LAVA、RT-2、PaLM-E 全部基线和各自奖励分数。" /></a>
    <figcaption>Table 2，PDF 文件第 7 页。Yilun Du 等，《Video Language Planning》，arXiv:2310.10625v1，2023-10-16。<a href="https://arxiv.org/pdf/2310.10625v1#page=7">原 PDF</a> · <a href="https://arxiv.org/abs/2310.10625v1">许可标注来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁出完整表格，保留任务、奖励、完成率与所有基线；点击查看高清图。</figcaption>
  </figure>
  <p>读每组的 Completion 列：三类 Language Table 任务各测试 50 个仿真环境，统一最多执行 1500 步，提前完成则终止。VLP 按颜色分组为 92%，排直线却只有 16%；Reward 衡量部分进度，不能与整任务完成率混用。</p>
  <p>第 5 页表 1 则是人工检查每种设置的 50 段生成视频。其“Real Environment”列指从真实图像开始生成计划，并非真实机器人执行统计。例如真实图像排线的 56% 是视频计划达标率，不能当作真机成功率。</p>
  <p>基线也按长任务数据训练，但训练架构、预算和推理计算不同；VLP 还加入视频搜索和独立控制器，不能把整套系统的差距归于单一模块。附录报告每个仿真环境执行约需一小时，RT-2 基线约半小时；生成完整长视频计划约需 30 分钟，也不是实时规划。</p>
</section>

<section class="deep-section" id="real-and-transfer-limits">
  <h2>真机展示可执行性，尚缺完整成功率统计</h2>
  <p>Figure 7–8 展示真实 Language Table 和 7DoF 移动机器人的执行；ALOHA 的四相机结果主要展示生成计划。原文未给出对应真机整任务成功率表及重复试验次数，因此不能把这些示例扩展成跨三种硬件的统一量化结论。</p>
  <p>Language Table 使用仿真、真实各约一万条长轨迹，合计约 40 万个短指令标签；视频模型、VLM 和控制器按领域分别训练。多平台结果不等于同一策略零样本跨本体迁移。新物体、新光照与新任务主要是定性例子，图像状态仍难表达质量、力和不可见状态。</p>
  <p><a href="https://github.com/video-language-planning/vlp_code">官方仓库</a>提供示意 notebook、数据入口并链接另一实现；主要实验依赖 Google 基础设施，本次未复现。阅读路线：第 3–5 页看搜索与控制，第 6–8 页区分计划和执行，第 14–16 页查数据、评估及推理成本。</p>
</section>
