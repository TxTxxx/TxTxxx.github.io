---
title: "DreamZero 初读：把未来视频直接变成动作"
paper_title: "World Action Models are Zero-shot Policies"
date: 2026-08-31
authors: "Seonghyeon Ye, Yunhao Ge, Kaiyuan Zheng, Shenyuan Gao, Sihyun Yu, George Kurian, Suneel Indupuru, You Liang Tan, Chuning Zhu, Jiannan Xiang, Ayaan Malik, Kyungmin Lee, William Liang, Nadun Ranawaka, Jiasheng Gu, Yinzhen Xu, Guanzhi Wang, Fengyuan Hu, Avnish Narayan, Johan Bjorck, Jing Wang, Gwanghyun Kim, Dantong Niu, Ruijie Zheng, Yuqi Xie, Jimmy Wu, Qi Wang, Ryan Julian, Danfei Xu, Yilun Du, Yevgen Chebotar, Scott Reed, Jan Kautz, Yuke Zhu, Linxi Jim Fan, Joel Jang"
institutions: "NVIDIA"
venue: "arXiv preprint · 2026-02-17 · 尚未同行评审"
summary: "DreamZero 把视频预测与 inverse dynamics 合成一个 14B World Action Model，在真实执行后用观察替换预测缓存；它给出了未见任务和跨本体视频迁移的积极证据，但部分完成指标、小样本评测、专有数据与两张 GB200 的部署成本决定了它仍是一份高价值预印本，而不是通用零样本控制的终局。"
reading_time: "初读约 10 分钟"
paper_url: "https://arxiv.org/pdf/2602.15922"
project_url: "https://dreamzero0.github.io/"
hero_image: "/images/paper-radar/2026-08-31-dreamzero/joint-video-action-architecture-figure-4.png"
hero_alt: "DreamZero Figure 4：联合视频与动作流匹配架构，以及用真实观察更新预测缓存的闭环执行"
draft: false
---

<section class="deep-section" id="verdict">
  <div class="section-index">00 / VERDICT</div>
  <h2>30 秒判断</h2>
  <div class="verdict-box">
    <strong>值得精读，但标题里的 “zero-shot” 必须按论文协议理解。</strong>
    <p>DreamZero 是目前最直接的 WAM 命题之一：以 Wan2.1-I2V-14B 为骨干，同时生成未来视频与连续动作，并在每次真实执行后把新观察写回缓存。相同机器人、未见训练任务的结果明显超过作者控制训练的 GR00T N1.6 与 π0.5；只加入异构机器人或人类视频，也能提高目标机器人任务进度。它证明“视觉动力学先验可以进入真实控制闭环”，却没有证明任意新任务、新环境或新机器人都能零样本解决。数据仍来自同类桌面操控，指标多为部分进度，部署还需要两张 GB200。</p>
  </div>
</section>

<section class="deep-section" id="problem">
  <div class="section-index">01 / PROBLEM</div>
  <h2>问题：VLA 看懂语义，却未必学到世界怎样变化</h2>
  <p>主流 VLA 从静态图文预训练获得语义，再用机器人轨迹学习动作。它们知道“杯子是什么”，但物体接触、形变、遮挡和动作后果仍主要靠昂贵的带动作数据补齐。视频 world model 反过来擅长预测视觉变化，却通常只生成画面；若再训练一张独立策略去追随生成视频，动力学与动作之间仍有接口损失。</p>
  <p>DreamZero 的问题因此很干净：能不能把未来视觉轨迹本身当作动作策略的隐变量，让一个模型在预测“接下来会看见什么”的同时输出“接下来该执行什么”？如果可以，大量不带机器人动作的视频就不必先被伪标注，也可能向新本体迁移视觉层面的任务知识。</p>
</section>

<section class="deep-section" id="method">
  <div class="section-index">02 / METHOD</div>
  <h2>方法拆解：一次联合生成，一个闭环缓存</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2602.15922#page=6" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-31-dreamzero/joint-video-action-architecture-figure-4.png" alt="DreamZero 的联合视频动作模型与闭环推理流程" /></a>
    <figcaption>原论文 Figure 4，PDF 第 6 页：Wan2.1 视频骨干接收视觉历史、语言与本体状态，联合去噪未来视频和连续动作；真实执行后以新观察替换缓存中的预测帧。来源：Ye et al., “World Action Models are Zero-shot Policies”；原文以 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 发布，此处仅裁切，未改变图意。点击查看原 PDF 页面。</figcaption>
  </figure>

  <div class="mechanism-grid">
    <div><strong>① 先继承视频生成先验</strong><p>骨干是 14B Wan2.1-I2V。文本、当前与历史图像进入视频条件，机器人 proprioception 和语言共同约束预测；文本/图像编码器与 VAE 冻结，DiT 及新动作、状态模块参与训练。</p></div>
    <div><strong>② 联合 flow matching</strong><p>模型同时去噪未来视频 latent 与连续 action chunk。概率上可看成先预测任务条件下的未来观察，再由 inverse dynamics 从视觉未来和历史推出动作，但两者在同一个网络中端到端学习。</p></div>
    <div><strong>③ 分块自回归执行</strong><p>训练采用 chunk-wise teacher forcing，推理时生成一段未来和一段动作。机器人只执行当前动作块，不把很长的视频幻想一次性开环兑现。</p></div>
    <div><strong>④ 用现实纠正想象</strong><p>执行后，新相机观察会覆盖 KV cache 内对应的预测帧，再继续生成下一块。这一步非常关键：模型保留上下文，却不会让早先视频误差无限滚动。</p></div>
  </div>

  <p>因此，DreamZero 不是经典意义上“先想象很多轨迹、再搜索最优动作”的 planner。它是一张以未来视频为内部表征的闭环生成策略。这个定位解释了它为何能受益于视频，又为何仍会在视觉预测失败时直接输出错误动作。</p>
</section>

<section class="deep-section" id="novelty">
  <div class="section-index">03 / NOVELTY</div>
  <h2>真正的新意：动作与未来画面不再是两个串联模型</h2>
  <p>从预测视频反推动作并非新概念，视频扩散用于机器人控制也已有多条路线。DreamZero 真正推进的是接口：视觉未来与动作共享模型、训练目标和自回归缓存，而且模型能在没有额外 action label 的异构视频上只优化视觉部分，再把所得变化知识传回动作生成。</p>
  <p>这使跨本体迁移有了不同于“统一动作空间”的路径。论文加入 YAM 双臂机器人视频或人类第一视角操作视频，目标 AgiBot 的动作头从未看见这些来源的动作，平均任务进度仍由 38.3 提升至 55.4 或 54.3。结果支持视觉动力学可以跨本体贡献，但两类机器人外形相近，标准误差达到约 7.6–10.4，远未证明任意形态都能共享。</p>
</section>

<section class="deep-section" id="evidence">
  <div class="section-index">04 / EVIDENCE</div>
  <h2>关键实验一：未见任务有增益，但衡量的是部分进度</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2602.15922#page=14" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-31-dreamzero/unseen-task-generalization-figure-9.png" alt="DreamZero 与 GR00T N1.6、pi0.5 在未见任务上的对比" /></a>
    <figcaption>原论文 Figure 9，PDF 第 14 页：AgiBot 与 DROID 的未见任务结果，柱形图同时区分从头训练与官方预训练 VLA。来源：Ye et al.；原文 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>，此处保留完整图例和原始 caption。点击查看原 PDF 页面。</figcaption>
  </figure>

  <p>AgiBot 评测含 10 个训练内与 10 个训练外任务，每个 checkpoint 在四台机器人、不同场景和物体上共 80 次 rollout。DreamZero 在已见任务平均进度 62.2，最佳预训练 VLA 为 27.4；未见任务为 39.5，对比 16.3。DROID 另测 20 个已见与 20 个未见语言动作，未见任务进度/完整成功率为 49.0/22.5，GR00T N1.6 为 31.0/12.5，π0.5 为 33.0/7.5。</p>
  <p>这足以说明受控协议里的优势不是一段 cherry-picked 视频。但“任务进度”按子目标累计，39.5 不能读成 39.5% 全任务成功；AgiBot 每项通常只有 8 次试验。更准确的结论是：联合视频动作建模显著改善了多步操作的推进和恢复，最终成功的绝对水平仍有很大空间。</p>

  <h2>关键实验二：无动作异构视频确实能帮助策略</h2>

  <figure class="paper-figure">
    <a href="https://arxiv.org/pdf/2602.15922#page=16" target="_blank" rel="noreferrer"><img src="/images/paper-radar/2026-08-31-dreamzero/cross-embodiment-transfer-table-2.png" alt="DreamZero 使用异构机器人和人类视频进行跨本体迁移的结果" /></a>
    <figcaption>原论文 Table 2，PDF 第 16 页：只增加异构机器人或人类视频监督未来视觉，AgiBot 九个未见任务的平均进度均提升。来源：Ye et al.；原文 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>，此处仅裁切表格与 caption。点击查看原 PDF 页面。</figcaption>
  </figure>

  <p>该实验使用九个未见任务、共 72 条多视角评测轨迹；YAM 视频约 20 分钟，人类第一视角视频约 12 分钟，以 1:1 比例继续训练 10K 步。两种来源都带来约 16–17 个进度点的提升，这是论文最有辨识度的结果。与此同时，样本很小、误差条较宽，而且只测平均部分进度。55 条、约 30 分钟 YAM 轨迹的新本体适配则主要展示定性语言泛化，不应升级成“30 分钟学会任意机器人”的结论。</p>
</section>

<section class="deep-section" id="limits">
  <div class="section-index">05 / LIMITS</div>
  <h2>可信度与主要局限</h2>
  <h3>值得信的部分</h3>
  <p>NVIDIA 团队在机器人学习、生成视频与通用策略上有连续记录；基线同时报告从头训练与官方预训练版本，并尽量使用相同 AgiBot/DROID 数据、步数和 batch。真实评测覆盖两个本体、已见与未见任务，论文也直接承认失败主要来自视频预测错误、精密插入与长时推理不足。代码与推理框架已经开放，预印本的证据密度明显高于纯演示型 WAM。</p>
  <h3>不能外推的部分</h3>
  <p>论文尚未同行评审，基线由作者团队自行复现；核心约 500 小时 AgiBot 数据并未公开。所谓 zero-shot 仍处在相近桌面操作分布与语言组合内，不是开放世界控制。跨本体不是一个模型同时学习多套动作空间，而是分别在 AgiBot 或 DROID 数据上训练；论文把统一多本体训练列为未来工作。</p>
  <h3>速度和精度是硬门槛</h3>
  <p>14B 视频骨干经过量化与 DreamZero Flash 后，要两张 GB200 才达到约 150 ms、7 Hz；普通 VLA 已能在消费级 GPU 上超过 20 Hz。一步加速虽快，任务进度也会下降。作者还指出亚厘米精密任务、视频错误传播和上下文长度仍有限，因此当前系统更适合中速、容错较高的长动作块操作，而不是高频接触与精准装配。</p>
</section>

<section class="deep-section" id="reading">
  <div class="section-index">06 / READING PATH</div>
  <h2>原文阅读路径</h2>
  <ol class="reading-list">
    <li><span><strong>先看 PDF 第 6 页 Figure 4。</strong>确认联合去噪、action chunk 与真实观察回写缓存的顺序；这是整篇最重要的一张图。</span></li>
    <li><span><strong>读第 10–12 页数据与评测设置。</strong>记住 500 小时、7.2K episodes、每项 8 次，以及 task progress 的 rubric，避免只看平均柱形。</span></li>
    <li><span><strong>看第 14 页 Figure 9。</strong>分清 scratch、official-pretrained 和 DreamZero，也把 AgiBot 进度与 DROID 完整成功率分开。</span></li>
    <li><span><strong>看第 16 页 Table 2 与第 17 页速度/消融。</strong>检查跨本体视频增益的误差条，再评估两张 GB200、Flash 近似和规模消融的代价。</span></li>
    <li><span><strong>最后读第 18 页 Limitations。</strong>将论文自己承认的视觉失败、精度、上下文和多本体训练缺口写进笔记，而不是只保存项目页视频。</span></li>
  </ol>

  <h3>可靠原始入口</h3>
  <ul class="source-list">
    <li><a href="https://arxiv.org/abs/2602.15922" target="_blank" rel="noreferrer">arXiv 摘要、版本与 CC BY 4.0 许可</a></li>
    <li><a href="https://arxiv.org/pdf/2602.15922" target="_blank" rel="noreferrer">论文 PDF</a></li>
    <li><a href="https://dreamzero0.github.io/" target="_blank" rel="noreferrer">NVIDIA 作者项目页与真机演示</a></li>
    <li><a href="https://github.com/dreamzero0/dreamzero" target="_blank" rel="noreferrer">官方代码、推理说明与模型入口</a></li>
  </ul>
</section>
