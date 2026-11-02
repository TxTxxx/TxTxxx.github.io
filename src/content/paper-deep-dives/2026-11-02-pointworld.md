---
title: "PointWorld：共享三维点流怎样支持真机动作规划"
paper_title: "PointWorld: Scaling 3D World Models for In-The-Wild Robotic Manipulation"
date: 2026-11-02
authors: "Wenlong Huang、Yu-Wei Chao、Arsalan Mousavian、Ming-Yu Liu、Dieter Fox、Kaichun Mo、Li Fei-Fei"
institutions: "Stanford University、NVIDIA"
venue: "CVPR 2026"
summary: "解释几何动作接口、短时点流预测和真机规划，区分跨夹爪泛化、人工任务指定与闭环控制。"
reading_time: "约 4 分钟"
paper_url: "https://openaccess.thecvf.com/content/CVPR2026/papers/Huang_PointWorld_Scaling_3D_World_Models_for_In-The-Wild_Robotic_Manipulation_CVPR_2026_paper.pdf"
project_url: "https://point-world.github.io/"
hero_image: ""
hero_alt: ""
draft: false
---

<section class="deep-section" id="problem">
  <h2>把不同机器人的动作转为可比较的空间运动</h2>
  <p>PointWorld 预测给定机器人运动后，场景中的点会怎样移动。它从 RGB-D 恢复几何，将关节控制转换为机器人表面点轨迹，再预测场景点位移；共享的空间表示支持不同本体联合训练，但任务目标仍须另外指定。</p>
  <p>本导读由 Codex 整理，方法和主结果采用<a href="https://openaccess.thecvf.com/content/CVPR2026/papers/Huang_PointWorld_Scaling_3D_World_Models_for_In-The-Wild_Robotic_Manipulation_CVPR_2026_paper.pdf">CVPR 2026 会议原文</a>，试验协议补查<a href="https://arxiv.org/pdf/2601.03782v1#page=30">2026-01-07 arXiv v1 附录 A.6</a>。<a href="https://point-world.github.io/">作者项目页</a>核实作者与机构；Huang、Fei-Fei 此前参与 VoxPoser 等机器人操控研究，相关记录见<a href="https://wenlonghuang.com/">作者主页</a>。</p>
</section>

<section class="deep-section" id="method">
  <h2>夹爪轨迹和场景点云共同输入 PTv3</h2>
  <p><a href="https://openaccess.thecvf.com/content/CVPR2026/papers/Huang_PointWorld_Scaling_3D_World_Models_for_In-The-Wild_Robotic_Manipulation_CVPR_2026_paper.pdf#page=3">Figure 2，会议 PDF 文件第 3 页</a>展示核心接口。先看上方：关节动作经 URDF 与正向运动学变成紫色机器人点流，与 RGB-D 场景点拼接。再看左下：机器人点附带时间嵌入，场景点附带冻结 DINOv3 特征，PTv3 输出未来整片场景的位移。</p>
  <p>每次前向预测 10 步、每步 0.1 秒。实际动作表示主要采样每个夹爪的 300–500 个点，集中描述接触附近的几何；全身稀疏点流反而可能分散学习信号。这里保留了已知机器人几何的约束，并不直接从语言生成控制。</p>
</section>

<section class="deep-section" id="evidence">
  <h2>500 小时交互支持预训练，真机结果差异较大</h2>
  <p>训练混合 DROID 的真实 Franka 数据与 BEHAVIOR-1K 的仿真双臂人形数据，约 200 万个短轨迹片段、500 小时。真实数据通过深度估计、相机标定和点追踪补出三维监督，遮挡与标注误差仍会影响学习。</p>
  <p><a href="https://openaccess.thecvf.com/content/CVPR2026/papers/Huang_PointWorld_Scaling_3D_World_Models_for_In-The-Wild_Robotic_Manipulation_CVPR_2026_paper.pdf#page=7">Figure 4，会议 PDF 文件第 7 页</a>上方八根柱对应推纸巾盒、推书、围巾、枕头、微波炉、抽屉、掸子和扫帚，成功率依次为 70%、20%、80%、40%、30%、90%、60%、60%。应连同下方任务照片阅读，不能只摘最高的抽屉结果代表整体能力；图中没有误差条。</p>
  <p>附录报告每项任务 10 个随机初始配置，预先检查运动学可行性，由人复位；不安全的规划也计失败。统一预训练模型无需任务微调，真机使用训练中未见的 fin-ray 夹爪，但机械臂仍为 Franka，证据支持跨夹爪几何迁移，尚不足以证明任意新机械臂零样本控制。</p>
</section>

<section class="deep-section" id="planning">
  <h2>人工指定目标，整段优化耗时数秒</h2>
  <p>操作者借助 SAM2 选择物体掩码并指定三维目标点，MPPI 再搜索末端轨迹。规划向前看 30 步，以三次模型预测串接；每轮采样 256 个候选、优化 20 轮。论文的约 0.1 秒是模型前向延迟，完整规划通常耗时数秒。</p>
  <p>附录明确说明本次部署没有重新规划；柔性物体与工具任务从预抓取配置开始。因此，MPC 框架的采用不能直接等同于已验证在线闭环纠错。主文提供预测模型及动作表示的消融，但真机成功率图没有同设置的控制基线，无法据此量化相对其他策略的优势。</p>
</section>

<section class="deep-section" id="limits">
  <h2>静态起点、局部可见性与重用许可的边界</h2>
  <p>模型仅输入当前点云，缺少速度与长期记忆；细小物体易受标定噪声影响，点位移也不能描述开灯等纯外观变化。动作轨迹被视为可实现，未完整建模执行误差。阅读数值时还应检查真实数据的置信度过滤，避免把筛选后的点流误差当作全部场景可靠性。</p>
  <p>原图已从会议 PDF 渲染并核对。本页保留上述两处原图入口，不公开转载图片：<a href="https://arxiv.org/licenses/nonexclusive-distrib/1.0/license.html">arXiv v1 仅授予平台分发权</a>，<a href="https://openaccess.thecvf.com/">CVF 说明版权仍归权利人</a>，项目页也未找到明确的图像重用授权。Figure 2、Figure 4 均出自 Huang 等本文会议版，页码为 PDF 文件页码。</p>
  <p>原文路径：会议 PDF 第 3–4 页读表示，第 5–8 页查训练、消融与迁移；arXiv v1 第 30 页读部署协议，第 21–22 页查限制。<a href="https://github.com/NVlabs/PointWorld">官方实现入口</a>可用于进一步核对，本次未独立复现实验。</p>
</section>
