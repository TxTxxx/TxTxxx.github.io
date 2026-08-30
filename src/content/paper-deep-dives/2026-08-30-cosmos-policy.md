---
title: "Cosmos Policy 初读：把动作与规划写进视频扩散"
paper_title: "Cosmos Policy: Fine-Tuning Video Models for Visuomotor Control and Planning"
date: 2026-08-30
authors: "Moo Jin Kim, Yihuai Gao, Tsung-Yi Lin, Yen-Chen Lin, Yunhao Ge, Grace Lam, Percy Liang, Shuran Song, Ming-Yu Liu, Chelsea Finn, Jinwei Gu"
institutions: "NVIDIA; Stanford University"
venue: "International Conference on Learning Representations (ICLR) 2026"
summary: "Cosmos Policy 用 latent frame injection 把本体状态、动作、未来状态和价值接入预训练视频扩散模型；它在模拟与 ALOHA 真机上展示强策略结果，也证明经 rollout 校正后的 endpoint world model 能帮助 best-of-N 规划，但高延迟、真实数据成本和短预测视野仍是硬边界。"
reading_time: "初读约 10 分钟"
paper_url: "https://arxiv.org/pdf/2601.16163"
project_url: "https://research.nvidia.com/labs/dir/cosmos-policy/"
hero_image: "/images/paper-radar/2026-08-30-cosmos-policy/latent-frame-injection-figure-2.png"
hero_alt: "Cosmos Policy Figure 2：把机器人状态、动作、未来状态与价值注入视频模型 latent frames"
draft: false
---

<section class="deep-section" id="verdict">
  <div class="section-index">00 / VERDICT</div>
  <h2>30 秒判断</h2>
  <div class="verdict-box">
    <strong>值得精读：它把视频基础模型变成了真正可查询的机器人策略与短程世界模型，而且真机证据不只是一段演示。</strong>
    <p>Cosmos Policy 从 Cosmos-Predict2-2B 出发，不增加专用 action head，而把机器人本体状态、动作块、未来本体状态和价值都编码为视频 latent frames。改变输入 mask，同一模型就能直接出动作，也能在给定候选动作后预测动作块终点和价值。LIBERO、RoboCasa 与四项 ALOHA 结果说明这套接口很有竞争力；两个困难任务上的 model-based planning 也优于直接策略和 model-free value。需要同时记住：它预测的是约两秒动作块的终点，不是长时视频 rollout；规划约五秒才产生一个动作块，并依赖额外 648 条真实 rollout。</p>
  </div>
</section>

<section class="deep-section" id="problem">
  <div class="section-index">01 / PROBLEM</div>
  <h2>视频模型已经理解运动，怎样让它输出可执行动作</h2>
  <p>视频基础模型擅长根据上下文生成未来画面，却没有天然的机器人动作接口。常见路线是在视频骨干旁边增加 action head，或者只把生成视频当作外部 world model。前者可能没有充分使用生成模型对未来的表示，后者又让策略、动力学和价值分别学习相似的轨迹结构。</p>
  <p>这篇论文提出一个更统一的问题：机器人轨迹中的当前状态 <em>s</em>、动作 <em>a</em>、未来状态 <em>s′</em> 与价值 <em>V(s′)</em>，能否都成为视频扩散序列的一部分？如果同一个生成器能够回答不同条件查询，直接控制与 model-based planning 就可以共享骨干、数据和表示。</p>
</section>

<section class="deep-section" id="method">
  <div class="section-index">02 / METHOD</div>
  <h2>方法拆解：latent frame injection 如何接入机器人模态</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2601.16163#page=4" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-30-cosmos-policy/latent-frame-injection-figure-2.png" alt="Cosmos Policy 的 latent frame injection 与三种条件生成方式" /></a>
    <figcaption>原论文 Figure 2，PDF 第 4 页：本体状态、动作、未来状态与价值被覆盖进视频 latent sequence，并用 conditioning mask 切换策略、世界模型和价值查询。来源：Kim et al., “Cosmos Policy”，原文以 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 发布；此处仅裁切，未改变图意。点击查看原 PDF 页面。</figcaption>
  </figure>

  <div class="mechanism-grid">
    <div><strong>① 把数值变成 latent frame</strong><p>归一化后的机器人 proprioception、动作 chunk、未来 proprioception 和 scalar value 被复制到空白 latent frame 中；多相机视角也沿 frame 维度交错排列。模型看到的仍是一串视频 latent。</p></div>
    <div><strong>② 一个序列联合生成</strong><p>训练目标覆盖 <em>(s,a,s′,V(s′))</em>。50% batch 学策略，25% 学 world model，25% 学 value；没有额外 action decoder 改写预训练骨干。</p></div>
    <div><strong>③ mask 决定问题</strong><p>只给当前状态时采样 <em>p(a,s′,V|s)</em>，就是直接策略；再给候选动作时采样 <em>p(s′,V|s,a)</em>，就是 endpoint world model；给完整前缀可训练 value。</p></div>
    <div><strong>④ best-of-N 规划</strong><p>先并行采样多个动作候选，再预测每个候选执行后的终点状态和价值，挑最高者执行。作者还比较了直接估计 <em>Q(s,a)</em> 的 model-free 版本。</p></div>
  </div>

  <p>两个实现细节决定了它的真实能力边界。首先，模型不使用历史观察；其次，动作块内部不逐帧预测未来，只生成 <em>t+K</em> 的 endpoint state。ALOHA 上一块约两秒、25 Hz，并整块执行。这能降低生成成本，却也意味着“world model”在这里主要负责短程结果评估，并非可任意滚动的视频模拟器。</p>
</section>

<section class="deep-section" id="novelty">
  <div class="section-index">03 / NOVELTY</div>
  <h2>真正的新意：视频 latent 成为通用机器人 I/O</h2>
  <p>动作 tokenization 本身不新，视频模型预测机器人未来也不新。Cosmos Policy 的新意在于避免为数值动作另造专用输出空间：连续控制、视觉未来与价值共享预训练视频模型的扩散接口。于是“policy”与“world model”的差异主要变成 conditioning pattern，而不是两套架构。</p>
  <p>这也提供了一个有用消融。去掉未来状态和价值的辅助训练，LIBERO 平均分下降 1.5；从随机初始化训练相同架构则下降 3.9。真机折衣任务中，从头训练的策略只有 80.8，对完整模型的 99.5，而且动作明显更抖，作者因此没有继续其余 scratch 真机评测。证据支持视频预训练和联合监督都有效，但不能据此判断哪类互联网视频知识具体迁移到了控制。</p>
</section>

<section class="deep-section" id="evidence">
  <div class="section-index">04 / EVIDENCE</div>
  <h2>最关键实验一：真机策略很强，OOD 冠军却不是它</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2601.16163#page=8" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-30-cosmos-policy/aloha-real-robot-results-figure-4.png" alt="Cosmos Policy 与 Diffusion Policy、OpenVLA-OFT、pi0、pi0.5 的 ALOHA 真机结果" /></a>
    <figcaption>原论文 Figure 4 图表，PDF 第 8 页：四项 ALOHA 任务的真机部分完成分。来源：Kim et al.；原文 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>，此处裁出图表区域，图例与数值未修改。点击查看原 PDF 页面。</figcaption>
  </figure>

  <p>四项任务分别使用 80、15、45、45 条示范。每种方法共跑 101 次，具体为 30 / 20 / 25 / 26，并复用同一组 ID 与 OOD 初始状态。平均分由 Diffusion Policy 的 33.6、OpenVLA-OFT+ 的 62.0、π0 的 77.9、π0.5 的 88.6，上升到 Cosmos Policy 的 93.6。这比只挑成功视频更可信。</p>
  <p>不过该指标允许部分完成，不能直接读作 93.6% 完整成功率。附录 Table 3 还揭示：Cosmos Policy 的总体平均最高，但 OOD 平均为 89.3，π0.5 是 92.5。更准确的结论是它在相同示范上的综合控制能力很强，尚未证明跨分布泛化全面超过现有 VLA。</p>

  <h2>最关键实验二：规划有效，但依赖真实经验与计算</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2601.16163#page=10" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-30-cosmos-policy/model-based-planning-figure-7.png" alt="Cosmos Policy 在两个 ALOHA 困难任务中的直接策略、model-free 与 model-based planning 对比" /></a>
    <figcaption>原论文 Figure 7，PDF 第 10 页：两个困难任务中，直接策略、<em>Q(s,a)</em> model-free 规划与 <em>V(s′)</em> model-based 规划的对比。来源：Kim et al.；原文 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>，此处仅裁切。点击查看原 PDF 页面。</figcaption>
  </figure>

  <p>作者先复用前述各策略评测产生的 505 条 rollout，再额外采 143 条 Cosmos Policy 拉链袋任务 rollout，共 648 条，用失败/部分成功经验重训世界模型与价值。两个困难任务的直接策略平均 59.5，model-free <em>Q(s,a)</em> 规划为 61.3，显式预测终点再估 <em>V(s′)</em> 的 model-based 规划达到 72.0。</p>
  <p>这组对照支持“生成未来状态有额外价值”，因为它优于同模型的直接 <em>Q</em> 评分。但提升来自真实 rollout 校正后的模型，规划每个动作块约耗时五秒，并以多 GPU 并行候选；搜索树只有一层。它证明了受控慢速操作中的短程 best-of-N 有效，没有证明实时、深层或少经验规划已经解决。</p>
</section>

<section class="deep-section" id="limits">
  <div class="section-index">05 / LIMITS</div>
  <h2>可信度与主要局限</h2>
  <h3>值得信的部分</h3>
  <p>论文已被 ICLR 2026 接收；NVIDIA 与 Stanford 作者在机器人学习、视频模型和 VLA 上有持续记录。模拟端 LIBERO 每套 500 次、三 seed，共 6,000 次评测；RoboCasa 24 项任务每项 50 次、三 seed，共 3,600 次。真机方法共享数据和初始状态，代码、模型与训练数据开放。这些都让主结论明显强于普通预印本。</p>
  <h3>不能外推的部分</h3>
  <p>真实机器人只覆盖一套 ALOHA 和四项桌面任务；作者团队自行运行所有基线，虽有统一协议，仍缺独立复现。RoboCasa 跨论文对比中，Cosmos 每任务仅用 50 条示范是优势，但其他方法的数据与训练协议并不完全一致。动作块开环执行、无输入历史、只预测终点，也限制了动态环境与误差恢复能力。</p>
  <h3>“统一”不等于“免费”</h3>
  <p>视频基础模型带来强先验，也带来推理与训练成本。规划需要额外真实 rollout 才能覆盖失败分布，五秒延迟会排除快速动态任务；best-of-N 依赖并行设备。当前结果更像一个高质量的方向验证：统一生成接口可用，距离部署级通用 WAM 仍有明显系统工程距离。</p>
</section>

<section class="deep-section" id="reading">
  <div class="section-index">06 / READING PATH</div>
  <h2>原文阅读路径</h2>
  <ol class="reading-list">
    <li><span><strong>先看 PDF 第 4 页 Figure 2。</strong>确认什么被写进 latent frame，以及三个 conditioning mask 分别回答什么概率问题。</span></li>
    <li><span><strong>读第 5–6 页 §4.2–4.3。</strong>特别标出 50/25/25 的训练混合、endpoint prediction 与 rollout post-training。</span></li>
    <li><span><strong>看第 8 页 Figure 4，再跳到附录 Table 3。</strong>把总体优势与 π0.5 的 OOD 优势同时记下，也确认部分完成分的定义。</span></li>
    <li><span><strong>最后读第 10–11 页 Figure 7 和 Discussion。</strong>核对 648 条 rollout、五秒延迟与一层 best-of-N；这是判断规划可部署性的核心。</span></li>
  </ol>

  <h3>可靠原始入口</h3>
  <ul class="source-list">
    <li><a href="https://openreview.net/forum?id=wPEIStHxYH" target="_blank" rel="noreferrer">ICLR 2026 OpenReview 论文页</a></li>
    <li><a href="https://arxiv.org/abs/2601.16163" target="_blank" rel="noreferrer">arXiv 摘要、版本与 CC BY 4.0 许可</a></li>
    <li><a href="https://arxiv.org/pdf/2601.16163" target="_blank" rel="noreferrer">论文 PDF</a></li>
    <li><a href="https://research.nvidia.com/labs/dir/cosmos-policy/" target="_blank" rel="noreferrer">NVIDIA 作者项目页、模型与演示</a></li>
    <li><a href="https://github.com/NVlabs/cosmos-policy" target="_blank" rel="noreferrer">官方代码、模型与训练数据</a></li>
  </ul>
</section>
