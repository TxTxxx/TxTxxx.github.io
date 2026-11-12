---
title: "DepthWorld 用深度监督改善动作条件视频预测"
paper_title: "DepthWorld: 3D World Model for Robot Manipulation"
date: 2026-11-12
authors: "Jai Bardhan、Josef Šivic、Vladimír Petrík"
institutions: "捷克理工大学 CIIRC"
venue: "CoRL 2026 已接收"
summary: "从 DROID-3D 标定、RGB 与深度的潜空间拼接，到同数据和训练预算下的预测消融。"
reading_time: "约 5 分钟"
paper_url: "https://arxiv.org/pdf/2610.08780v1"
project_url: "https://jaibardhan.com/depthworld/"
hero_image: "/images/paper-radar/2026-11-12-depthworld/rgb-depth-tiling-and-point-map.png"
hero_alt: "三个相机的 RGB 与深度历史经 VAE 编码，SVD U-Net 按动作预测未来，DPT 分支输出基座坐标系的三维点图。"
draft: false
---

<section class="deep-section" id="calibration" style="scroll-margin-top:9rem">
  <h2>为同一机器人联合标定多段轨迹</h2>
  <p>Codex 整理。DepthWorld 研究给定末端动作后，三个相机的未来视频和深度能否保留一致的物体几何。论文先构建训练监督，再比较加入深度前后的预测质量。三位作者也共同开发了 PersistWorld，研究自回归机器人视频模型的长期预测稳定性。<a href="https://arxiv.org/abs/2610.08780v1">论文与作者信息</a> · <a href="https://jaibardhan.com/depthworld/">CoRL 2026 接收信息</a> · <a href="https://jaibardhan.com/persistworld/">PersistWorld</a></p>
  <p>DROID-3D 从公开原始双目数据估计深度，再用因子图把同一台物理机器人的多段记录放在一起求解。机器人运动学参数跨片段共享，外参按场景拟合。这样可以在更多姿态上约束参数，同时保留各次采集的相机位置差异。筛选后共 71,100 段轨迹，来自 13 个实验室的 28 台机器人。标定部分的重投影误差衡量图像对应的一致性，机器人基座坐标系的对齐还有独立评估。<a href="https://arxiv.org/pdf/2610.08780v1#page=8">原文 Table 1</a></p>
</section>

<section class="deep-section" id="joint-prediction" style="scroll-margin-top:9rem">
  <h2>六块潜变量共享一个去噪网络</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-12-depthworld/rgb-depth-tiling-and-point-map.png"><img src="/images/paper-radar/2026-11-12-depthworld/rgb-depth-tiling-and-point-map.png" width="1358" height="399" style="height:auto" alt="DepthWorld 架构从左到右展示三视角 RGB 和深度历史、动作条件 SVD U-Net，以及未来 RGB、深度和三维点图输出。" /></a>
    <figcaption>Figure 3，PDF 文件第 6 页。Jai Bardhan、Josef Šivic、Vladimír Petrík，《DepthWorld: 3D World Model for Robot Manipulation》，arXiv:2610.08780v1，2026-10-06。裁出完整原图，点击可看高清版本。<a href="https://arxiv.org/pdf/2610.08780v1#page=6">原 PDF</a> · <a href="https://arxiv.org/html/2610.08780v1">许可标注</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></figcaption>
  </figure>
  <p>看左侧两列输入。两个外部相机和一个腕相机各有 RGB 与深度，经原 SVD VAE 独立编码后横向拼模态、纵向叠视角，每帧形成 72×80 的潜空间网格。U-Net 接收逐帧末端位姿，用六帧历史预测五帧未来，5 Hz 是视频采样率。</p>
  <p>右下角 DPT 分支从预测的未来潜变量读出基座坐标系的三维点及其置信度。目标点图由深度反投影后再按外参变换得到，使各视角的监督落在同一坐标系。作者先训练 RGB 与深度去噪 4 万步，再加入点图监督联合训练 5 万步。<a href="https://arxiv.org/pdf/2610.08780v1#page=7">原文训练设置</a></p>
</section>

<section class="deep-section" id="controlled-ablation" style="scroll-margin-top:9rem">
  <h2>同预算消融将深度与点图的贡献分开</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-12-depthworld/held-out-rgb-depth-ablation.png"><img src="/images/paper-radar/2026-11-12-depthworld/held-out-rgb-depth-ablation.png" width="1222" height="399" style="height:auto" loading="lazy" alt="Table 2 按外部相机和腕相机列出 RGB、RGB 加深度、再加点图监督的预测指标，保留各指标的优化方向与六行完整数据。" /></a>
    <figcaption>Table 2，PDF 文件第 9 页。Jai Bardhan、Josef Šivic、Vladimír Petrík，《DepthWorld: 3D World Model for Robot Manipulation》，arXiv:2610.08780v1，2026-10-06。保留表头与完整数据行，点击可看高清版本。<a href="https://arxiv.org/pdf/2610.08780v1#page=9">原 PDF</a> · <a href="https://arxiv.org/html/2610.08780v1">许可标注</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></figcaption>
  </figure>
  <p>先看外部视角的 PSNR 列，从 22.63 dB 到 24.09 dB 的增益出现在加入深度后，再加点图监督达到 24.11 dB。腕视角的深度 RMSE 则由 0.150 降至 0.148 米，外部视角的 AbsRel 略升。表里没有画误差区间，点图分支的增益应按视角和指标判断。</p>
  <p>RGB 基线用相同架构、数据划分与预算重训。评测抽取 256 段留出轨迹，留出单位是轨迹，训练和评测仍共享机器人与实验室。深度指标使用经过 VAE 编解码的估计深度作为参考，附录 D.3 说明了有效像素和米制单位。<a href="https://arxiv.org/html/2610.08780v1">原文附录 D.3</a></p>
</section>

<section class="deep-section" id="reading-path" style="scroll-margin-top:9rem">
  <h2>预测精度是后续控制实验的起点</h2>
  <p>论文报告标定和离线预测结果。自回归误差仍会积累，腕视角深度精度也低于外部视角。若要判断它能否用于几何奖励或策略排序，还需要真机执行对照。先读 §4 与 Figure 3，再对照 Table 2 和附录 D.3，最后看 D.4 的 PointWorld 比较，其中两种模型预测的对象与各自参考深度不同。项目提供代码、模型检查点与重标定外参，完整 DROID-3D 数据列有申请入口。<a href="https://jaibardhan.com/depthworld/">项目资源</a></p>
</section>
