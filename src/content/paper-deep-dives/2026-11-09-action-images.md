---
title: "Action Images：把末端动作画成热图，再从多视角解码控制"
paper_title: "Action Images: End-to-End Policy Learning via Multiview Video Generation"
date: 2026-11-09
authors: "Haoyu Zhen、Zixian Gao、Qiao Sun、Yilin Zhao、Yuncong Yang、Yilun Du、Pengsheng Guo、Tsun-Hsuan Wang、Yi-Ling Qiao、Chuang Gan"
institutions: "UMass Amherst、NVIDIA、Harvard、Genesis AI（论文署名机构）"
venue: "NeurIPS 2026 已接收"
summary: "解释 RGB 动作热图及多视角几何解码，核对未见 xArm 的开环结果与动作头、相机和实现配置的限制。"
reading_time: "约 5 分钟"
paper_url: "https://arxiv.org/pdf/2604.06168v2"
project_url: "https://actionimages.github.io/"
hero_image: "/images/paper-radar/2026-11-09-action-images/rgb-gaussian-action-image-representation.png"
hero_alt: "Action Images Figure 2：将机械臂末端位置、法向和上方向三个语义点投影到 RGB 高斯热图，蓝通道同时编码夹爪开合。"
draft: false
---

<section class="deep-section" id="pixel-grounded-control">
  <h2>动作与观测共享视频表示</h2>
  <p>Action Images 将末端位置、姿态和夹爪开合转成与相机画面对齐的热图，视频模型同时生成未来观测和动作图，再通过几何计算恢复控制。主要策略不需要独立的学习式动作头，但仍需要相机信息、动作监督和解码器。</p>
  <p>本导读由 Codex 整理，采用<a href="https://arxiv.org/abs/2604.06168v2">2026-04-15 arXiv v2</a>；<a href="https://neurips.cc/virtual/2026/poster/150968">NeurIPS 2026 官方记录</a>确认接收。Zhen、Gao 为共同第一作者，十位作者来自 UMass、NVIDIA、Harvard 与 Genesis AI。<a href="https://haoyuzhen.com/">Zhen 的研究记录</a>列有与 Du、Gan 合作的 ICML 2024 3D-VLA、ICCV 2025 TesserAct，延续了具身生成模型研究线。</p>
</section>

<section class="deep-section" id="encode-and-decode">
  <h2>三个语义点表示位姿，第二视角约束深度</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-09-action-images/rgb-gaussian-action-image-representation.png"><img src="/images/paper-radar/2026-11-09-action-images/rgb-gaussian-action-image-representation.png" width="1280" height="800" style="height:auto" alt="Figure 2 完整动作编码图：左侧机械臂标出末端位置、Normal Point 和 Up Point，分别投影到红、绿、蓝三个高斯通道；蓝通道的低响应背景还保存夹爪开合信息。" /></a>
    <figcaption>Figure 2，PDF 文件第 5 页。Haoyu Zhen、Zixian Gao 等，《Action Images: End-to-End Policy Learning via Multiview Video Generation》，arXiv:2604.06168v2，2026-04-15。<a href="https://arxiv.org/pdf/2604.06168v2#page=5">原 PDF</a> · <a href="https://arxiv.org/abs/2604.06168v2">许可标注来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁去页眉、图注和相邻正文，保留完整机制图；点击查看高清图。</figcaption>
  </figure>
  <p>看红、绿、蓝三个通道：红色点给出末端位置，另外两个点沿末端坐标轴偏移，共同确定朝向；蓝通道的低响应区域另存二值夹爪状态。它编码的是可投影的末端控制，不能直接覆盖任意多关节或灵巧手动作。</p>
  <p>解码时先求主视角热图中心，再沿对应相机射线采样三维候选，用侧视角热图选深度。三个恢复点决定位置和旋转，背景响应恢复开合。相机参数、热图分辨率和射线采样间隔都影响精度；准确定位二维点也不保证得到准确三维控制。</p>
  <p>训练将观测和动作视频的 VAE 潜变量拼接，用不同遮罩统一学习联合生成、给动作预测视频、给视频标动作和纯视频生成。数据表列 RLBench 18 万、DROID 8 万、BridgeV2 3 万条轨迹；DROID 还要过滤低质量标定，BridgeV2 仅作视频监督并用 VGGT 估计相机。因此“零样本”描述留出设置的迁移，模型此前已接受机器人数据训练。</p>
</section>

<section class="deep-section" id="open-loop-evidence">
  <h2>五项真机任务验证开环执行，成功率仍有限</h2>
  <figure class="paper-figure">
    <a href="/images/paper-radar/2026-11-09-action-images/zero-shot-rlbench-and-xarm-open-loop-results.png"><img src="/images/paper-radar/2026-11-09-action-images/zero-shot-rlbench-and-xarm-open-loop-results.png" width="1300" height="430" style="height:auto" loading="lazy" alt="Table 2 全部任务与基线：左四列是 RLBench，右五列是真机。Action Images 真机放杯、拿未见玩具、拿纸巾、关抽屉、关盒成功率为 40、20、15、45、10%；保留 MV-Policy、π0.5、MolmoAct、TesserAct、Cosmos-Policy 全行。" /></a>
    <figcaption>Table 2，PDF 文件第 11 页。Haoyu Zhen、Zixian Gao 等，《Action Images: End-to-End Policy Learning via Multiview Video Generation》，arXiv:2604.06168v2，2026-04-15。<a href="https://arxiv.org/pdf/2604.06168v2#page=11">原 PDF</a> · <a href="https://arxiv.org/abs/2604.06168v2">许可标注来源</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。仅裁出完整表格，数值为成功率百分比；采用一次预测、无在线重规划的开环评估，原文未披露重复试验次数。点击查看高清表。</figcaption>
  </figure>
  <p>先看右侧 Real 五列，再看左侧仿真：真机 xArm、物体和环境均未见，关抽屉为 45%，关盒只有 10%。RLBench 只留出具体任务，机械臂和环境已见，任务也可能存在于其他数据源；不能把两种“零样本”混为一谈。表中未给试验总次数或置信区间，不能从 5% 的间隔倒推出样本量。</p>
  <p>TesserAct 与 Cosmos-Policy 是在作者数据上、用同一 Wan 骨干重做的版本；π0.5 加了相机 MLP，MolmoAct 使用多视角轨迹提升到三维。它们不是各自官方默认配置，训练与推理适配也不同，排名不宜扩展成通用模型能力比较；仿真关笔记本上本方法也未领先。</p>
</section>

<section class="deep-section" id="precision-and-reproduction">
  <h2>动作头仍能提升精度，完整闭环尚未验证</h2>
  <p><a href="https://arxiv.org/pdf/2604.06168v2#page=12">表 3</a>中，九项域内 RLBench 任务平均成功率从几何解码的 20.6% 增至加 MLP 动作头的 36.7%。这说明动作图可用于控制，但纯几何读出仍有精度瓶颈；额外监督的结果不能替代无动作头的零样本证据。</p>
  <p>作者明确尚未形成完整闭环策略。<a href="https://arxiv.org/pdf/2604.06168v2#page=17">表 7</a>的最快设置用 8 张 H100、16 步去噪，生成四路合计 164 帧耗时 2.3 秒；约 71 FPS 是生成吞吐，不能当成机器人控制频率。正文写 Wan 2.2，附录训练细节写 Wan2.1-I2V-14B，效率表又列 5B，配置记载不一致，复现前需核对。</p>
  <p><a href="https://github.com/UMass-Embodied-AGI/ActionImages">官方仓库</a>提供训练、推理、权重及 RLBench 数据入口，README 使用 Wan2.2-TI2V-5B；Bridge 预处理仍标 TODO。本次未运行模型复现。阅读路线：第 5–8 页查编码与解码，第 9–10 页看遮罩和数据，第 11–12 页区分迁移与域内精度，第 16–17 页核对配置与成本。</p>
</section>
