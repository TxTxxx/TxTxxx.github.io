---
title: "Masked Visual Actions：局部运动怎样连接正向与逆向预测"
paper_title: "Masked Visual Actions for Unified World Modeling"
date: 2026-11-03
authors: "Hadi Alzayer、Wenlong Huang、Haonan Chen 等（完整作者见原文）"
institutions: "Stanford University、University of Maryland, College Park、Harvard University"
venue: "NeurIPS 2026 已接收"
summary: "解释掩码运动条件化，核对跨本体消融、80 段真机示范评估与仿真控制结果的边界。"
reading_time: "约 5 分钟"
paper_url: "https://arxiv.org/pdf/2607.19343v1"
project_url: "https://masked-visual-actions.github.io/"
hero_image: "/images/paper-radar/2026-11-03-masked-visual-actions/forward-inverse-masked-motion-interface.png"
hero_alt: "Masked Visual Actions 的两条输入路径：机器人渲染轨迹用于预测场景，物体运动用于生成机器人行为，分别连接规划、评估和逆动力学动作提取。"
draft: false
---

<section class="deep-section" id="problem">
  <h2>显露谁的运动，决定补全谁的行为</h2>
  <p>Masked Visual Actions 将动作表达为视频中局部可见的运动。给出机器人轨迹，模型补全场景响应；给出物体轨迹，同一模型尝试补全能实现它的机器人行为。生成的视频仍需额外模块才能转为可执行控制。</p>
  <p>本导读由 Codex 整理，固定依据<a href="https://arxiv.org/abs/2607.19343v1">2026-07-21 arXiv v1</a>。<a href="https://neurips.cc/Downloads/2026">NeurIPS 2026 官方列表</a>已列入本文，<a href="https://haonan16.github.io/">共同作者主页</a>也标注接收；不将预印本当作已核对的会议终稿。团队来自 Stanford、UMD 与 Harvard；Huang 此前参与 VoxPoser、ReKep，Chen 曾研究双臂状态扩散与逆动力学，相关记录见作者主页及原文参考文献 [8]。</p>
</section>

<section class="deep-section" id="method">
  <h2>同一视频模型读取机器人渲染或物体运动</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-03-masked-visual-actions/forward-inverse-masked-motion-interface.png"><img src="/images/paper-radar/2026-11-03-masked-visual-actions/forward-inverse-masked-motion-interface.png" width="1222" height="399" style="height:auto" alt="Figure 3 完整应用图：上方策略动作经 URDF 和相机参数渲染成机器人运动，视频模型预测场景，用于 VLM 排序或人工评估；下方物体运动条件生成机器人视频，再经逆动力学模型输出动作。" /></a>
    <figcaption>Figure 3，PDF 文件第 5 页。Hadi Alzayer、Wenlong Huang、Haonan Chen 等，《Masked Visual Actions for Unified World Modeling》，arXiv:2607.19343v1，2026-07-21。<a href="https://arxiv.org/pdf/2607.19343v1#page=5">原 PDF</a> · <a href="https://arxiv.org/abs/2607.19343v1">许可标注来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁去页边、图注及相邻内容，保留完整图；点击查看高清图。</figcaption>
  </figure>
  <p>沿上方看：轨迹的几何外形直接呈现在像素中，模型无需从关节向量重新推断机器人外观。下方交换条件对象，得到逆向生成；但右下角仍有独立的逆动力学模型，不能把视频补全等同于直接输出关节指令。</p>
  <p>训练结合 DROID 机器人分割视频及基于 URDF 的渲染视频，另含 RoboCasa 仿真。分割可能通过遮挡轮廓泄漏场景信息，渲染则依赖标定和机器人模型。约 15 小时是适配交互数据：Wan-Fun-Control 2.2 14B 以 rank 256 LoRA 训练约一万步，使用八张 H200、约四天，并非从零训练的总数据预算。</p>
</section>

<section class="deep-section" id="transfer">
  <h2>同骨干消融支持视觉接口，不能外推任意本体控制</h2>
  <p>表 2 在同基础模型、同 DROID 数据下比较条件表示：未见双臂本体 BEHAVIOR 的 PSNR，掩码运动为 22.90 dB，骨架为 19.58 dB，末端可视化为 19.23 dB。它支持该接口的预测迁移，尚未验证新本体上的真机控制。</p>
  <p>附表 C1 给出 BEHAVIOR、DROID 各 50 段，自采真机 13 段的重建评估与标准误。Ctrl-World 使用不同模型和训练覆盖，双臂输入还通过选取活跃单臂来适配；其比较无法单独分离表示的贡献。主表与附表的部分 Wan-Move 数值也不一致，宜优先阅读同骨干消融。</p>
</section>

<section class="deep-section" id="real-evaluation">
  <h2>真机部分验证进度预测，仍会高估完成程度</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-03-masked-visual-actions/real-demonstration-progress-distributions.png"><img src="/images/paper-radar/2026-11-03-masked-visual-actions/real-demonstration-progress-distributions.png" width="632" height="387" style="height:auto" loading="lazy" alt="Figure 10 完整图：横轴为橙子装袋、积木堆叠、毛巾入碗和关闭抽屉，纵轴为每次试验的任务进度 0% 至 100%；灰色代表真实执行、橙色代表模型预测，黑色短线代表均值，保留全部分布和图例。" /></a>
    <figcaption>Figure 10，PDF 文件第 9 页。Hadi Alzayer 等，《Masked Visual Actions for Unified World Modeling》，arXiv:2607.19343v1，2026-07-21。<a href="https://arxiv.org/pdf/2607.19343v1#page=9">原 PDF</a> · <a href="https://arxiv.org/abs/2607.19343v1">许可标注来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁出 Figure 10，排除相邻 Figure 9 与正文；保留完整坐标、分布、均值与图例，点击查看高清图。</figcaption>
  </figure>
  <p>对照每组灰、橙两侧及黑色均值：分布相近，但装袋和关闭抽屉的模型进度更乐观。每项任务 20 段示范，共 80 段；这里重放已记录动作来预测视频，没有用规划器提升真机成功率。</p>
  <p>附录 H 按子阶段计分：装袋、毛巾各两分，堆叠四分，抽屉一分。因此纵轴是归一化任务进度，不能统一解释为整项任务成功概率。图中的分布宽度也不是置信区间。</p>
</section>

<section class="deep-section" id="control-limits">
  <h2>规划和逆向动作提取的收益来自仿真</h2>
  <p>RoboCasa 规划以 Diffusion Policy 提出候选，视频模型预测，再由 Gemini 3.1 Pro 排序；每项十个场景、每场景十条候选，收益包含额外采样和评分计算。仿真策略评估相关系数 0.982 也不等于绝对成功率校准。</p>
  <p>逆向动作提取在单个咖啡杯任务中达到 18/20，逆动力学与基线各用 100 段示范；前者读取生成的完整视频，基线只读首帧，输入信息并不相同。细微接触、未见区域和推理速度仍有限，不能据此宣称普遍优于 VLA。</p>
  <p>原文路径：第 4–6 页看条件与训练，第 7–9 页看消融及应用，第 17–21 页查评分、策略训练和真机规则。<a href="https://github.com/HadiZayer/masked-visual-actions">官方代码</a>提供 LoRA 训练与推理入口；本次未独立复现。</p>
</section>
