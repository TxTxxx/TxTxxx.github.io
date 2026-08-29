---
title: "UWM 初读：用扩散时间步切换策略与世界模型"
paper_title: "Unified World Models: Coupling Video and Action Diffusion for Pretraining on Large Robotic Datasets"
date: 2026-08-29
authors: "Chuning Zhu, Raymond Yu, Siyuan Feng, Benjamin Burchfiel, Paarth Shah, Abhishek Gupta"
institutions: "University of Washington; Toyota Research Institute"
venue: "Robotics: Science and Systems (RSS) 2025 · Paper 15"
summary: "UWM 用同一个扩散 Transformer 联合建模动作与未来观察，并通过两个模态的扩散时间步切换 policy、forward dynamics、inverse dynamics 和 video prediction；真机结果支持这种统一预训练，但证据仍局限于同域 DROID 视频、单一 Franka 平台与短时任务。"
reading_time: "初读约 10 分钟"
paper_url: "https://arxiv.org/pdf/2504.02792"
project_url: "https://weirdlabuw.github.io/uwm/"
hero_image: "/images/paper-radar/2026-08-29-unified-world-models/unified-training-inference-figure-2.png"
hero_alt: "Unified World Models 论文 Figure 2：联合训练、策略边缘推断与逆动力学条件推断"
draft: false
---

<section class="deep-section" id="verdict">
  <div class="section-index">00 / VERDICT</div>
  <h2>30 秒判断</h2>
  <div class="verdict-box">
    <strong>值得精读：它最强的贡献是一个统一的概率接口，而不是更大的世界模型。</strong>
    <p>UWM 把动作和未来观察都当作扩散变量。控制两者各自的 diffusion timestep，同一个 Transformer 就能成为 policy、forward dynamics、inverse dynamics 或 video predictor。这个设计在 LIBERO 与 5 个 Franka 真机任务上稳定优于 Diffusion Policy、PAD 和 GR1，共训无动作视频后还能继续提升。但边界必须说清：主实验中的“视频”主要是去掉动作标签的同域 DROID 轨迹，模型预测的是较短未来观察，不是可长时间滚动、跨本体泛化的通用物理模拟器。</p>
  </div>
</section>

<section class="deep-section" id="problem">
  <div class="section-index">01 / PROBLEM</div>
  <h2>为什么 policy 与 world model 总在重复学习</h2>
  <p>机器人轨迹天然包含三样东西：当前观察 <em>o</em>、动作 <em>a</em>、未来观察 <em>o′</em>。策略学习 <em>p(a|o)</em>，正向动力学学习 <em>p(o′|o,a)</em>，逆动力学学习 <em>p(a|o,o′)</em>，视频预测则学习 <em>p(o′|o)</em>。传统做法通常为它们设计不同网络或不同输出头，结果是对相同的视觉、接触和可控性结构重复建模，也很难把没有动作标签的视频直接变成策略预训练信号。</p>
  <p>UWM 的问题因此很具体：能否让一个联合模型表示这些条件分布，并让“有动作轨迹”和“只有视频”在同一个去噪目标里训练？如果可以，世界模型就不只是 policy 外部的想象器，也可能是 policy 本身的一种推断模式。</p>
</section>

<section class="deep-section" id="method">
  <div class="section-index">02 / METHOD</div>
  <h2>方法拆解：两个时间步就是四种开关</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2504.02792#page=4" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-29-unified-world-models/unified-training-inference-figure-2.png" alt="UWM 联合训练与两种推断模式" /></a>
    <figcaption>原论文 Figure 2，PDF 第 4 页：左为动作/未来观察联合去噪，右为 policy 的边缘推断与 inverse dynamics 的条件推断。来源：Zhu et al., “Unified World Models.” 原文以 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 发布；此处仅裁切版面，未改变图意。点击查看原 PDF 页面。</figcaption>
  </figure>

  <div class="mechanism-grid">
    <div><strong>① 联合去噪</strong><p>当前观察作为条件，动作与未来观察分别加噪；模型同时预测两边的噪声。关键是动作时间步 <em>tₐ</em> 与观察时间步 <em>tₒ′</em> 独立采样。</p></div>
    <div><strong>② 边缘化</strong><p>要做 policy，就把未来观察设为最大噪声，相当于边缘化 <em>o′</em>，只反向扩散动作；要做纯视频预测，则反过来边缘化动作。</p></div>
    <div><strong>③ 条件化</strong><p>要做 forward dynamics，就把给定动作放在零噪声端，生成未来观察；给出目标观察并反向扩散动作，则得到 inverse dynamics。</p></div>
    <div><strong>④ 无动作视频共训</strong><p>视频没有动作标签时，把动作端固定为纯噪声、只计算观察损失。它仍更新共享视觉与动力学表示，随后由有标签轨迹把表示落到控制上。</p></div>
  </div>

  <p>真正漂亮的地方是：四种能力不是四个 task token，也不是四套 decoder，而是同一联合分布在不同“已知/未知模态”条件下的采样。模型结构是 diffusion Transformer；观察先经 encoder，未来图像被 patchify，动作与图像 token 一起进入骨干。统一性因此来自训练目标与推断规则。</p>
</section>

<section class="deep-section" id="novelty">
  <div class="section-index">03 / NOVELTY</div>
  <h2>真正的新意：用噪声级别表达缺失模态</h2>
  <p>多模态模型常用 mask 告诉网络“这里没有动作”。UWM 更进一步：完全噪声对应被边缘化，干净输入对应条件变量，中间噪声则参与联合去噪。这样训练时自然覆盖不同条件组合，推断时只改时间步就切换任务。它为 WAM/VLA 提供了一个值得复用的设计原则：不要先决定世界模型与策略的模块边界，先检查它们是否只是同一轨迹分布的不同条件查询。</p>
  <p>论文还显示 inverse dynamics 的特殊价值：给定参考未来观察，在相同轨迹时长下，它在 Book-Caddy / Soup-Cheese 上达到 0.65 / 0.55，而普通 policy 只有 0.47 / 0.26。不过普通 policy 若允许 1,000 步交互会达到 1.00 / 0.97，所以正确解读是“目标图像能提高固定预算下的跟随效率”，不是 inverse dynamics 普遍优于闭环策略。</p>
</section>

<section class="deep-section" id="evidence">
  <div class="section-index">04 / EVIDENCE</div>
  <h2>最关键实验：共训视频在 ID 与 OOD 上都提供增益</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2504.02792#page=7" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-29-unified-world-models/real-robot-results-table-1.png" alt="UWM 五项真实机器人任务的 ID 与 OOD 成功率" /></a>
    <figcaption>原论文 Table I，PDF 第 7 页：5 个 Franka 真机任务的预训练 / 视频共训结果，含 ID 与 OOD。来源：Zhu et al.；原文 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>，此处仅裁切。点击查看原 PDF 页面。</figcaption>
  </figure>

  <p>表中最一致的信号不是某一个最高数字，而是 UWM 从 pretrain 到 cotrain 几乎全面上升：Stack-Bowls 的 ID/OOD 从 0.86/0.76 到 0.92/0.84，Block-Cabinet 从 0.76/0.60 到 0.84/0.72，Hang-Towel 从 0.82/0.64 到 0.86/0.76。Rice-Cooker 是更长时的多阶段任务，也从 0.60 到 0.65。每项任务除 Rice-Cooker 外使用 50 个初始化，Rice-Cooker 为 20；每个初始化允许 3 次尝试。</p>
  <p>LIBERO 采用 4,500 条 LIBERO-90 轨迹预训练、每个下游任务 50 条示范微调，5 个任务、50 个初始化、3 个随机种子；UWM 平均成功率 0.79，对比 Diffusion Policy 0.71、PAD 0.57、GR1 0.58。附录还测试 Kinetics-400 与 Something-Something V2：互联网视频确有小幅提升，但通常低于同域机器人视频，例如 Stack-Bowls 为 0.88 对 0.92。这一对照让“视频规模化”的结论更可信，也把它的边界暴露得很清楚。</p>
</section>

<section class="deep-section" id="limits">
  <div class="section-index">05 / LIMITS</div>
  <h2>论文证明了什么，以及没有证明什么</h2>
  <h3>证明了：联合动作—观察扩散是有效的预训练接口</h3>
  <p>在同一 Franka/DROID 生态、受控桌面任务与 LIBERO 上，统一目标持续优于三类基线；代码、模型与训练配置公开，RSS 同行评审也让证据强于普通预印本。</p>
  <h3>没有证明：任意视频都能大幅提升机器人策略</h3>
  <p>主结果里的 action-free video 是另外 2,000 条 DROID 轨迹去掉动作，而不是开放互联网视频。互联网视频提升存在但较小，说明本体、视角和交互分布匹配仍很重要。</p>
  <h3>没有证明：这是长时程通用世界模拟器</h3>
  <p>模型采用 Markov observation 假设，重点是未来观察与策略预训练；实验只覆盖一类 Franka 平台。它没有展示分钟级闭环 rollout、跨本体直接迁移或复杂接触的长期一致性。PAD 表现异常低也提醒我们：统一输入格式下的复现可能受 conditioning 实现影响，不能只看最大差值。</p>
  <h3>成功率要按试验协议理解</h3>
  <p>真机初始化数量不算少，但每个初始化给 3 次尝试；附录细分 OOD 条件时每个 setting 仅 5 次。结果足以支持方法方向，不足以精确估计长尾失败概率。</p>
</section>

<section class="deep-section" id="reading">
  <div class="section-index">06 / READING PATH</div>
  <h2>原文阅读路径</h2>
  <ol class="reading-list">
    <li><span><strong>先看 PDF 第 4 页 Figure 2 与公式 (1)–(5)。</strong>抓住“最大噪声＝边缘化、零噪声＝条件化”，其余架构细节会自然落位。</span></li>
    <li><span><strong>再看第 6–7 页实验协议与 Table I。</strong>核对 DROID 共训数据、微调示范数、ID/OOD 与三次尝试的定义。</span></li>
    <li><span><strong>读第 9 页 Table III–IV。</strong>区分 inverse dynamics 的参考轨迹优势与普通 policy 的长期闭环能力，并注意细分 OOD 样本很小。</span></li>
    <li><span><strong>最后看附录 Table IX。</strong>它是判断“互联网视频是否真的有效”最重要、也最容易被摘要省略的一组数字。</span></li>
  </ol>

  <h3>可靠原始入口</h3>
  <ul class="source-list">
    <li><a href="https://www.roboticsproceedings.org/rss21/p015.html" target="_blank" rel="noreferrer">RSS 2025 正式论文页与 DOI</a></li>
    <li><a href="https://arxiv.org/abs/2504.02792" target="_blank" rel="noreferrer">arXiv 版本记录、摘要与 CC BY 4.0 许可</a></li>
    <li><a href="https://arxiv.org/pdf/2504.02792" target="_blank" rel="noreferrer">论文 PDF（v3，2025-05-23）</a></li>
    <li><a href="https://weirdlabuw.github.io/uwm/" target="_blank" rel="noreferrer">作者项目页与真机视频</a></li>
    <li><a href="https://github.com/WEIRDLabUW/unified-world-model" target="_blank" rel="noreferrer">作者代码、模型 checkpoint 与训练说明</a></li>
  </ul>
</section>
