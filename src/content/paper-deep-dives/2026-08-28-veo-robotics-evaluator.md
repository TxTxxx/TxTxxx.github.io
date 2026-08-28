---
title: "Veo 机器人评估器初读：世界模型能否替真实机器人做压力测试"
paper_title: "Evaluating Gemini Robotics Policies in a Veo World Simulator"
date: 2026-08-28
authors: "Gemini Robotics Team; Krzysztof Choromanski, Coline Devin, Yilun Du, Debidatta Dwibedi, Ruiqi Gao, Abhishek Jindal, Thomas Kipf, Sean Kirmani, Isabel Leal, Fangchen Liu, Anirudha Majumdar, Andrew Marmon, Carolina Parada, Yulia Rubanova, Dhruv Shah, Vikas Sindhwani, Jie Tan, Fei Xia, Ted Xiao, Sherry Yang, Wenhao Yu, Allan Zhou"
institutions: "Google DeepMind"
venue: "arXiv technical report · v2 · not peer reviewed"
summary: "这篇报告最重要的结论不是 Veo 能生成逼真的机器人视频，而是动作条件视频模型已经能在有限任务范围内排序 VLA 策略、估计 OOD 退化并发现安全漏洞；它离替代真实评测仍差长时物理、一致性和跨策略验证。"
reading_time: "初读约 10 分钟"
paper_url: "https://arxiv.org/pdf/2512.10675"
project_url: "https://veo-robotics.github.io/"
hero_image: "/images/paper-radar/2026-08-28-veo-robotics-evaluator/action-conditioning-multiview-figure-2.png"
hero_alt: "Veo Robotics 论文 Figure 2 的动作条件与四视角视频生成示意"
draft: false
---

<section class="deep-section" id="verdict">
  <div class="section-index">00 / VERDICT</div>
  <h2>30 秒判断</h2>
  <div class="verdict-box">
    <strong>值得精读：这是少数把 world model 的“决策价值”与真实机器人逐项对齐的工作。</strong>
    <p>在 5 个 ALOHA 2 双臂任务、8 个 Gemini Robotics On-Device（GROD）策略检查点和 1600+ 次真实评测上，Veo (Robotics) 能较好预测策略的相对排名：名义场景 Pearson 相关系数为 0.88，MMRV 排序误差为 0.03。它还能判断背景、干扰物与新物体分别会让策略退化多少，并用生成场景做安全 red teaming。但这篇论文证明的是“有限范围内可用的代理评估器”，不是“通用机器人模拟器”：rollout 只有 8 秒，成功率没有校准，所有策略来自同一家族，新物体、接触和多视角一致性依然是硬伤。</p>
  </div>
</section>

<section class="deep-section" id="problem">
  <div class="section-index">01 / PROBLEM</div>
  <h2>论文要解决的不是训练，而是测试</h2>
  <p>VLA 迭代的瓶颈正在从“能否学出动作”转向“怎样知道新 checkpoint 是否真的更好”。名义任务可以在硬件上反复跑，但一旦要覆盖陌生物体、不同背景、长尾干扰物和危险场景，组合数量会迅速爆炸；有些安全失败甚至不该在真实硬件上大规模复现。</p>
  <div class="question-grid">
    <div><strong>策略选型</strong><p>不用把每个 checkpoint 全量上机，能否先在生成世界里排出强弱？</p></div>
    <div><strong>OOD 压测</strong><p>能否批量改变物体、背景和干扰物，找出策略真正敏感的变化轴？</p></div>
    <div><strong>安全红队</strong><p>能否先在生成 rollout 中发现“指令本身无害、执行后才危险”的行为？</p></div>
  </div>
  <p>因此这篇工作的评价标准不是 FVD 或画面观感，而是生成世界给出的结论能否和真实机器人一致。尤其要注意“相对排序”和“绝对成功率”是两个不同目标：研发阶段经常只需要知道 A 是否优于 B，而上线门槛则需要知道成功率究竟是多少。论文主要在前者上取得进展。</p>
</section>

<section class="deep-section" id="method">
  <div class="section-index">02 / METHOD</div>
  <h2>方法拆解：先把动作塞进 Veo，再把场景编辑接到闭环前面</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2512.10675#page=4" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-28-veo-robotics-evaluator/action-conditioning-multiview-figure-2.png" alt="Veo Robotics 动作条件与四视角联合生成" /></a>
    <figcaption>原论文 Figure 2，PDF 第 4 页：上半部分是动作位姿条件，下半部分是四相机联合生成。来源：Gemini Robotics Team et al., “Evaluating Gemini Robotics Policies in a Veo World Simulator.” 原文以 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 发布；此处仅裁切版面，未改变图意。点击回到原 PDF。</figcaption>
  </figure>

  <div class="mechanism-grid">
    <div><strong>① 动作条件视频模型</strong><p>底座是 latent diffusion 架构的 Veo 2。作者用大规模机器人数据微调，让模型接收当前图像和未来机器人 pose 序列，生成这些动作可能导致的未来观察。</p></div>
    <div><strong>② 四视角联合生成</strong><p>顶视、侧视、左右腕部相机被拼成一个 tiled frame 一起生成。这样策略在闭环中仍能得到与真实部署相似的多相机输入，而不是只看第三人称视频。</p></div>
    <div><strong>③ 生成式场景变换</strong><p>名义场景先由 Gemini 2.5 Flash Image 改写背景、大小干扰物或交互物体，再由专门的 Veo 2 多视角补全模型生成其余三个相机视图。</p></div>
    <div><strong>④ Policy-in-the-loop</strong><p>策略读取四视角和语言输出动作，Veo 根据动作生成下一段观察，策略再继续决策。每条闭环 rollout 长 8 秒，最后由人工做二元成功判定。</p></div>
  </div>

  <p>这里有一个重要的系统分层：图像编辑器负责“构造测试条件”，多视角补全负责“把变化同步到所有相机”，Veo (Robotics) 负责“根据动作展开未来”。如果只用一张编辑后的顶视图直接测试多相机 VLA，策略会面对自相矛盾的观察；如果只让 Veo 自己生成 OOD 场景，又很难精确控制变化轴。三段式设计让作者可以把背景、干扰物和目标物体分开测试。</p>
</section>

<section class="deep-section" id="novelty">
  <div class="section-index">03 / NOVELTY</div>
  <h2>真正的新意：把 world model 当测量仪器，而不是演示视频生成器</h2>
  <p>论文的核心转向是从“预测下一帧像不像”改成“由预测得出的工程判断对不对”。名义评测中，作者设置 80 组场景—指令组合，包含改写、拼写错误、不同语言和不同具体程度；然后同时在真实 ALOHA 2 与 Veo 世界里测试 8 个 GROD checkpoint。生成成功率整体偏低，但策略强弱顺序基本保持一致。</p>
  <p>OOD 部分更进一步：它不只问某个策略在合成变化下是否下降，还问四种变化轴的难度排序是否与真实世界一致。安全部分则把危险物体放进原本普通的场景，让策略真正 rollout 后再判断是否违反物理或语义约束。这比只看初始图像和指令的安全分类更接近闭环风险。</p>
  <div class="signal-note"><p><strong>不要被“1600+”单独说服：</strong>数量很可观，但样本仍集中在 5 个桌面双臂任务、同一 GROD 策略谱系和相近的机器人数据生态。它说明方法在这个受控切片里成立，还没有证明不同架构、不同本体或开放场景中的泛化。</p></div>
</section>

<section class="deep-section" id="evidence">
  <div class="section-index">04 / EVIDENCE</div>
  <h2>最关键实验：相关性会随着分布偏移变难而下降</h2>
  <div class="metric-grid">
    <div><strong>0.88 / 0.03</strong><p>名义场景中，预测与真实成功率的 Pearson / MMRV。说明它很适合做同家族 checkpoint 的相对排序。</p></div>
    <div><strong>0.86 / 0.06</strong><p>固定一个策略时，四种 OOD 变化轴的 Pearson / MMRV。模型能判断哪类变化更伤策略。</p></div>
    <div><strong>8 seconds</strong><p>每次闭环生成的时间跨度。足以覆盖短时抓放，却不足以支持一分钟以上的长时程操控结论。</p></div>
  </div>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2512.10675#page=8" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-28-veo-robotics-evaluator/ood-policy-correlation-figure-9.png" alt="Veo Robotics 在背景、干扰物和新物体条件下的预测与真实成功率相关性" /></a>
    <figcaption>原论文 Figure 9，PDF 第 8 页：四种 OOD 变化下多个策略的生成评测与真实评测对应关系。来源：Gemini Robotics Team et al.；原文 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>，此处仅裁切。点击查看原 PDF 页面。</figcaption>
  </figure>

  <p>这张图比总平均值更重要。背景变化的 Pearson 是 0.91、MMRV 为 0；小干扰物降到 0.86 / 0.10，大干扰物是 0.77 / 0.14，而替换交互物体时只有 0.56 / 0.15。换句话说，世界模型越需要模拟陌生物体的接触与策略对陌生概念的反应，代理评测越不稳。它仍提供方向性信号，却不该被当作精确成功率估计器。</p>
  <p>安全 red teaming 的证据则偏定性。作者生成需要多模态语义判断的危险场景，例如执行“关上笔记本”时附近存在易碎物，随后用真实道具复现了模型预告的若干不安全行为。这证明流程能发现候选漏洞，但没有形成覆盖率、假阳性率或策略间可比较的安全指标，因此不能把它读成安全认证。</p>
</section>

<section class="deep-section" id="limits">
  <div class="section-index">05 / LIMITS</div>
  <h2>论文证明了什么，以及没有证明什么</h2>
  <h3>证明了：world model 可以是有用的前置筛选器</h3>
  <p>在相同策略家族、短时桌面操作和已知机器人平台上，Veo rollout 的相对结论与硬件结论有较强相关性。这已经足以支持一个现实工作流：先大规模生成压测，再把最值得验证的 checkpoint、场景和安全失败送上真实机器人。</p>
  <h3>没有证明：生成评测能独立替代硬件</h3>
  <p>生成成功率系统性低于真实成功率，说明数值没有校准。接触丰富的小物体交互会出现物体凭空出现、重复、穿透或不现实运动；多视角也会不一致。更关键的是，世界模型与被测 GROD 策略都来自 DeepMind 的机器人数据体系，论文没有跨 OpenVLA、π 系列、GR00T 等架构验证排序是否仍然成立。</p>
  <h3>没有证明：它已经解决长时程与自动评测</h3>
  <p>8 秒是当前硬边界，作者把 1 分钟以上多视角一致生成列为未来工作。所有生成 rollout 还需要人工判定成功；若未来用 VLM 自动打分，还会引入第二层 reward-model 偏差。Veo 模型、机器人微调数据和完整评测系统也未开放，第三方暂时无法复现关键数字。</p>
  <h3>预印本地位要保留</h3>
  <p>团队质量和实验投入很高，但截至今天它仍是未同行评审的技术报告。论文对能力边界的披露相对诚实，这增加了可信度，却不能替代独立复现。</p>
</section>

<section class="deep-section" id="reading">
  <div class="section-index">06 / READING PATH</div>
  <h2>原文阅读路径</h2>
  <ol class="reading-list">
    <li><span><strong>先看 PDF 第 4–5 页 Figure 2 与 Figure 4。</strong>先理解动作条件、多视角接口，再确认论文真正优化的是策略排序而非绝对校准。</span></li>
    <li><span><strong>再看第 6–8 页 §4 与 Figure 8–9。</strong>比较背景、干扰物和新物体的相关性，特别留意 object shift 明显更弱。</span></li>
    <li><span><strong>快速读第 9–10 页安全实验。</strong>把它视为发现漏洞的案例，不要当作定量安全 benchmark。</span></li>
    <li><span><strong>最后读第 12 页 Discussion。</strong>作者列出的接触幻觉、8 秒时域、人工评分和推理效率，正是判断后续 WAM 论文的检查清单。</span></li>
  </ol>

  <h3>可靠原始入口</h3>
  <ul class="source-list">
    <li><a href="https://arxiv.org/abs/2512.10675" target="_blank" rel="noreferrer">arXiv 摘要、版本记录与 CC BY 4.0 许可</a></li>
    <li><a href="https://arxiv.org/pdf/2512.10675" target="_blank" rel="noreferrer">论文 PDF（v2，2026-01-06）</a></li>
    <li><a href="https://veo-robotics.github.io/" target="_blank" rel="noreferrer">作者项目页：名义、OOD、安全与失败案例视频</a></li>
  </ul>
</section>
