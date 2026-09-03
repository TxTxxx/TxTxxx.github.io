---
title: "VLA 共训练初读：五类数据、三种阶段与一组反例"
paper_title: "A Systematic Study of Data Modalities and Strategies for Co-training Large Behavior Models for Robot Manipulation"
date: 2026-09-03
authors: "Fanqi Lin, Kushal Arora, Jean Mercat, Haruki Nishimura, Paarth Shah, Chen Xu, Mengchao Zhang, Mark Zolotas, Maya Angeles, Owen Pfannenstiehl, Andrew Beaulieu, Jose Barreiros"
institutions: "Toyota Research Institute · Tsinghua University"
venue: "RSS 2026 · 2026-02-01 首次公开"
summary: "这篇论文把 VLA 共训练拆成五类数据和三种训练阶段，在 89 个策略、58,000 次模拟与 2,835 次真机 rollout 上给出可操作结论：视觉语言监督和跨本体机器人数据最稳，动作 token 与显式低层 CoT 没有普遍收益，视频 latent action 只在低机器人数据区间有效。结论扎实，但边界主要是双臂 Franka、末端控制与模仿学习。"
reading_time: "初读约 11 分钟"
paper_url: "https://co-training-lbm.github.io/files/TRI-LBM-co-training.pdf"
project_url: "https://co-training-lbm.github.io/"
hero_image: "/images/paper-radar/2026-09-03-co-training-study/editorial-cover.svg"
hero_alt: "Paper Radar 自制编辑封面：五条异构数据流经过三段训练轨道汇入 VLA；不是原论文方法图"
draft: false
---

<section class="deep-section" id="verdict">
  <div class="section-index">00 / VERDICT</div>
  <h2>30 秒判断</h2>
  <div class="verdict-box">
    <strong>值得精读，原因是它提供选择数据的证据，而不是再发布一个更大的 VLA。</strong>
    <p>作者在同一 PaliGemma2 + flow-matching 策略框架内，比较五类共训练信号及其进入训练的阶段。最稳定的收益来自视觉语言监督和跨本体机器人数据：它们提升分布偏移、未见任务与语言跟随，却基本不改变训练分布内表现。FAST、VQ-VAE 动作 token、视频 latent action 和显式低层 CoT 则出现清楚的无效区间。对于正在设计 VLA / WAM 数据混合的人，这组负结果比单一 SOTA 数字更值钱。</p>
  </div>
</section>

<section class="deep-section" id="problem">
  <div class="section-index">01 / PROBLEM</div>
  <h2>问题：共训练已经流行，配方仍靠直觉</h2>
  <p>机器人数据昂贵，于是 VLA 开始混入互联网视觉语言数据、其他机器人的轨迹、人类视频、自动生成的动作描述和离散动作 token。每一种都有合理故事：语言带来语义，跨本体扩大动作覆盖，视频提供人类行为先验，token 把动作变成 VLM 熟悉的序列预测。但这些主张通常来自不同模型、不同数据量和不同评测，无法判断收益究竟来自信号本身、训练阶段，还是额外计算。</p>
  <p>这篇论文的研究问题很克制：保持目标机器人、架构和评测体系尽量一致，逐项回答“哪类数据提升哪种泛化”“在哪个阶段加入”“能否累加”“目标机器人数据增加后是否仍有效”。它不是完整的因果实验——数据源与监督形式仍有纠缠——但已经比横向比较论文榜单可靠很多。</p>
</section>

<section class="deep-section" id="method">
  <div class="section-index">02 / SETUP</div>
  <h2>实验底座：一个连续动作 VLA，五种额外监督</h2>
  <p>底座由 PaliGemma2-3B VLM 与 8 层 Action Flow Transformer 组成。图像与任务文本进入 VLM；作者新增 observation token，并抽取最后四层中该 token 的隐藏状态作为紧凑全局条件。动作头接收这份表示、带噪动作 chunk 和 flow timestep，预测 16 步连续末端轨迹。文本与离散 token 用交叉熵，连续动作用 flow matching。</p>

  <div class="mechanism-grid">
    <div><strong>① 标准视觉语言数据</strong><p>RoboPoint 与 RefSpatial 覆盖问答、目标定位、空间关系和多步空间推理，共约 3,800 万问答对。它不描述目标机器人的动作，负责保住 VLM 的视觉语义能力。</p></div>
    <div><strong>② 机器人轨迹语言标注</strong><p>一种由末端状态差写成低层动作原语；另一种让 VLM 根据稀疏视频帧、任务、动作提示和坐标系生成带物体交互语义的描述。两者都与目标机器人轨迹一一对应。</p></div>
    <div><strong>③ 跨本体机器人数据</strong><p>OXE-Ramen 含 12 种机器人设置、924 个任务、466,415 条示范，共 1,150 小时。它仍有真实连续动作，可以直接进入 action loss。</p></div>
    <div><strong>④ 人类视频</strong><p>约 2,271 小时 Ego4D、EgoDex、Something-Something V2 等视频；一条路线用 DINOv2 + LAM 压成离散 latent action，另一条用 VLM 生成每秒动作语言。</p></div>
    <div><strong>⑤ 离散机器人动作 token</strong><p>FAST 把动作 chunk 压成平均 42.1 个 token；VQ-VAE 用 8 个 token 表示同一 chunk。它们作为额外序列目标，不替换最终连续动作头。</p></div>
    <div><strong>三种训练阶段</strong><p>单阶段把目标机器人与共训练数据一起学；两阶段 first-phase-only 先学共训练数据、再只专门化目标本体；两阶段 full 在第二阶段继续保留共训练数据。</p></div>
  </div>

  <p><strong>原图阅读：</strong><a href="https://co-training-lbm.github.io/files/TRI-LBM-co-training.pdf#page=2" target="_blank" rel="noreferrer">PDF 第 2 页 Figure 1</a> 是模型、数据与评测总览；<a href="https://co-training-lbm.github.io/files/TRI-LBM-co-training.pdf#page=3" target="_blank" rel="noreferrer">第 3 页 Figure 2 / Table I</a> 展开五类数据与三阶段配方。论文当前公开许可未明确允许本站复用图像，因此本页提供精确页码而不转载截图；顶部封面是本站编辑图，不是论文示意图。</p>
</section>

<section class="deep-section" id="evidence">
  <div class="section-index">03 / EVIDENCE</div>
  <h2>关键证据一：有效的数据提升泛化，不负责刷训练集成绩</h2>
  <p>目标数据 TRI-Ramen 有 523 小时、403 个任务、53,411 条示范，来自双臂 Franka 的真实与模拟环境。模拟评测含 13 个已见任务和 8 个未见任务，并加入光照、纹理、干扰物、相机与颜色变化；真机评测覆盖已见物体、指令改写、未见物体和三个长时灵巧任务。总规模是 89 个 VLA、58,000 次模拟 rollout、2,835 次真机 rollout。</p>
  <p><a href="https://co-training-lbm.github.io/files/TRI-LBM-co-training.pdf#page=8" target="_blank" rel="noreferrer">PDF 第 8 页 Figure 4/5</a> 最值得先看。标准视觉语言数据、VLM 生成的机器人/人类视频标注和跨本体机器人数据主要改善 Seen-DS、Unseen、Unseen-DS 与语言跟随；训练分布内结果几乎不变。这种形状比单一平均分有信息：额外数据提供的是覆盖和表示稳健性，而非重复训练目标技能。</p>
  <p>训练阶段也取决于数据语义。跨本体轨迹与机器人语言标注通常适合放在第一阶段，再让第二阶段专门化目标本体；标准视觉语言数据与人类视频语言标注则适合第二阶段继续保留，避免 VLM 在目标机器人动作训练中忘掉更广的视觉知识。有效信号累加后，最终模型在模拟未见任务达到 72.6% 成功率、真机语言跟随达到 69.4% 平均完成度。</p>

  <h2>关键证据二：latent action 和 action token 没有通用红利</h2>
  <p>论文最有价值的图可能是<a href="https://co-training-lbm.github.io/files/TRI-LBM-co-training.pdf#page=10" target="_blank" rel="noreferrer">第 10 页 Figure 8</a>。视频 latent action 在目标机器人数据极少时有帮助；当目标数据从 1 个任务扩展到 13、41、403，乃至叠加 1,327 个 TRI/OXE 任务后，收益逐渐消失。这解释了为何小数据论文里的正结论不能直接搬到大规模机器人预训练。</p>
  <p>FAST 与 VQ-VAE 离散动作 token 在当前体系里没有统计显著增益；FAST 甚至降低未见任务泛化。一个合理解释是，近乎无损的 FAST 仍逼 VLM 记精确控制映射，把表示拉向本体专用细节；而连续 action head 已经承担执行，额外 token 目标只增加冲突。请注意限定词：这不能证明所有 action tokenizer 都无效，只证明这两种 token、这些损失比例与这套连续动作架构没有显示出通用收益。</p>
</section>

<section class="deep-section" id="novelty">
  <div class="section-index">04 / NOVELTY</div>
  <h2>真正的新意：寻找“有效区间”，而非宣布一种数据更好</h2>
  <p>这篇工作的贡献不是新模型模块。它把同一信号放进不同数据量和阶段，观察收益何时出现、何时消失，并把正结果与负结果一起报告。视频语言标注比 latent action 更稳，提示人类视频当前最可迁移的部分可能是物体、目标与交互语义，而不是粗粒度视觉变化 token；跨本体连续轨迹在第一阶段有效，则说明执行层仍需要真实动力学与控制经验。</p>
  <p>另一个反例是显式 CoT。作者让策略先生成脚本动作、VLM 动作描述或 latent action，再把它条件化到连续动作预测；这些显式路径都没有超过相同信号作为辅助监督的隐式共训练，有些还明显退化。论文的解释合理：评测任务有清楚的即时目标，观察到动作的映射较直接；低层 CoT 的生成误差会传给控制。这个结果不否定高层规划，只说明“多输出一些中间 token”不是免费推理能力。</p>
</section>

<section class="deep-section" id="credibility">
  <div class="section-index">05 / CREDIBILITY</div>
  <h2>为什么这组结果可信</h2>
  <p>论文已被 RSS 2026 接收，Toyota Research Institute 团队此前持续研究大规模双臂操控。统计上，作者没有只报一次均值：模拟二元成功与真机里程碑完成度使用成对比较和显著性分组，并控制 5% family-wise error；不同 checkpoint 尽量在相同初始条件、短时间窗口内顺序执行，减少光照与硬件漂移。另有独立评审者盲审 895 条真机视频，占真机 rollout 的 31.6%，总体完成度分歧仅 2.01%。</p>
  <p>下游适配也比简单 probe 更接近实际价值：在 Pack Items Into String Bag、Pour Ingredients Into Soup、Store Clean Dishes 三个未见长时灵巧任务上，每任务 200 条示范，最终共训练模型微调后达到 90.2% 平均完成度，比只用机器人数据预训练的 baseline 高 22.8%，比单任务从头训练高 42.9%。三个任务平均约 13 个步骤、93 秒，失败分析也落到封盖、抓取锅铲和透明杯等精细动作。</p>
</section>

<section class="deep-section" id="limits">
  <div class="section-index">06 / LIMITS</div>
  <h2>结论的边界</h2>
  <p>第一，主体系集中在双臂 Franka、RGB、相对末端位姿与 16 步 action chunk；对 humanoid 全身控制、触觉、高频接触或关节空间策略不能直接照搬。第二，所有研究都在模仿学习内完成，world model、在线强化学习和从失败中学习仍未测试。第三，五类数据并不只改变“模态”：来源质量、规模、语言生成器和任务覆盖同时变化，多模态累加实验也无法完全识别交互项。</p>
  <p>第四，人类视频只用了 coarse latent action 或 VLM 语言描述，没有显式手部姿态、精细接触或力学信息；结论应读成“当前两种抽取方式的比较”，不能读成“人类动作信息无用”。第五，CoT 主要是低层动作抽象，任务又有即时视觉反馈；它没有检验历史总结、反思、子目标规划等真正长时推理。最后，每个训练阶段约需 16 张 H100 运行 64 小时，完整 89 策略实验的资源门槛很高，外部团队难以原样复现。</p>
</section>

<section class="deep-section" id="reading">
  <div class="section-index">07 / READING PATH</div>
  <h2>原文阅读路径</h2>
  <ol class="reading-list">
    <li><span><strong>先看第 8–9 页 Figure 4–7。</strong>比较五类信号与三个阶段，不要先接受摘要里的总排名；尤其看 FAST、VQ-VAE 与 latent action 的负结果。</span></li>
    <li><span><strong>接着看第 10 页 Figure 8。</strong>这是“方法有效”与“只在低数据区间有效”的分界，也是今天最应该记住的一张图。</span></li>
    <li><span><strong>读第 10 页 Figure 9/10。</strong>检查有效模态能否累加，以及最终模型的 72.6% / 69.4% 来自哪些评测维度。</span></li>
    <li><span><strong>看第 11–12 页 Figure 11–13。</strong>下游长时适配、VLM 遗忘和显式 CoT 负结果共同决定这篇论文的解释力度。</span></li>
    <li><span><strong>最后读 Appendix 1、2 与真实评测流程。</strong>损失权重、batch 数据比例、算力和 895 条盲审 QA 能帮你判断结果可否迁移到自己的训练配方。</span></li>
  </ol>

  <h3>适合写进笔记的四个问题</h3>
  <ul class="source-list">
    <li>你的目标机器人数据量处在哪个区间？这个区间里，latent action 还有可能提供增益吗？</li>
    <li>哪些共训练信号应该在预训练后退出，哪些必须在目标本体专门化阶段继续保留？</li>
    <li>如果采用 WAM/world model，动作 token 是供动力学预测、规划，还是同时监督 VLM？三种用途不能用本文一个负结果统一否定。</li>
    <li>除了成功率，怎样测 VLM 的空间语义能力是否在动作训练中被遗忘，并与真实机器人泛化建立更强的因果联系？</li>
  </ul>

  <h3>可靠原始入口</h3>
  <ul class="source-list">
    <li><a href="https://arxiv.org/abs/2602.01067" target="_blank" rel="noreferrer">arXiv 摘要、版本与许可</a></li>
    <li><a href="https://co-training-lbm.github.io/files/TRI-LBM-co-training.pdf" target="_blank" rel="noreferrer">作者发布 PDF</a></li>
    <li><a href="https://roboticsconference.org/program/papers/7/" target="_blank" rel="noreferrer">RSS 2026 官方接收页</a></li>
    <li><a href="https://co-training-lbm.github.io/" target="_blank" rel="noreferrer">作者项目页与机器人视频</a></li>
  </ul>
</section>
