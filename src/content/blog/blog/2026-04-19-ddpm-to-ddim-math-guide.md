---
title: DDIM 不是“更快一点的 DDPM”：它到底改了哪条数学链路
date: 2026-04-19
summary: 从 DDPM 的后验高斯出发，推到 DDIM 如何通过保持相同边缘分布、放松马尔可夫约束，把随机逆扩散改写成可控的确定性采样。
tags:
  - ddim
  - ddpm
  - diffusion-models
  - generative-models
cover_image: /images/ddpm-to-ddim-cover.png
cover_alt: Diagram illustrating DDPM forward diffusion and reverse denoising process across timesteps
draft: false
---

# DDIM 不是“更快一点的 DDPM”：它到底改了哪条数学链路

很多人第一次看 DDIM，会把它理解成一句过度简化的话：把 DDPM 的采样步数从 1000 步砍到 50 步，图还没怎么坏。这个描述不算错，但它把最有意思的部分全抹掉了。DDIM 真正动刀的地方，不是“想办法把网络跑少几次”，而是它重新审视了一个更根本的问题：**DDPM 那条逐步、带随机性的马尔可夫逆链，真的是唯一必须的生成路径吗？**

答案是否定的。只要你保住每个时刻的边缘分布 $q(x_t|x_0)$，训练时那个熟悉的噪声预测目标就还能成立；而一旦你不再执着于“逆过程必须和 DDPM 一样是随机马尔可夫链”，你就能得到一整族新的采样过程。DDIM 是这族过程里最出名、也最实用的那个。

这篇文章不讲“DDIM 比 DDPM 快很多”这种正确但没营养的结论。我们只做四件事：

- 把 DDPM 的采样公式压缩到最关键的两三条
- 说明 DDPM 为什么慢，慢点到底卡在哪里
- 推导 DDIM 如何在不改训练目标的前提下重写逆过程
- 解释为什么当噪声项取零时，随机扩散会变成确定性映射

![DDPM forward diffusion and reverse denoising process](/images/ddpm-to-ddim-cover.png)

## DDPM 的训练已经很干净了，真正拖后腿的是采样链

如果你已经熟悉 DDPM，会知道它训练时其实相当规整。前向扩散被写成：

$$
q(x_t|x_{t-1}) = \mathcal{N}\big(x_t; \sqrt{\alpha_t}x_{t-1}, (1-\alpha_t)I\big)
$$

记

$$
\alpha_t = 1-\beta_t,\quad \bar{\alpha}_t=\prod_{s=1}^t \alpha_s
$$

则前向过程可以直接折叠成闭式解：

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\,\epsilon,\quad \epsilon\sim\mathcal{N}(0,I)
$$

训练时我们随机采一个时刻 $t$，用这条公式一步构造 $x_t$，再让网络预测噪声：

$$
\mathcal{L}_{simple}
=
\mathbb{E}_{x_0,\epsilon,t}
\left[
\|\epsilon-\epsilon_\theta(x_t,t)\|^2
\right]
$$

这件事本身并不慢。真正慢的是生成阶段。DDPM 要从

$$
x_T\sim \mathcal{N}(0,I)
$$

一路往回采：

$$
x_T \to x_{T-1} \to \cdots \to x_1 \to x_0
$$

每一步都要过一次网络，还要再加一次随机噪声。你可以把它理解成：训练时 DDPM 是并行的，采样时它却像在老老实实爬楼梯。

## DDPM 逆向一步为什么是随机的

DDPM 的核心不是“去噪”三个字，而是它近似了真实后验：

$$
q(x_{t-1}|x_t,x_0)
=
\mathcal{N}\big(x_{t-1};\tilde{\mu}_t(x_t,x_0), \tilde{\beta}_t I\big)
$$

其中

$$
\tilde{\beta}_t=\frac{1-\bar{\alpha}_{t-1}}{1-\bar{\alpha}_t}\beta_t
$$

而均值可以写成

$$
\tilde{\mu}_t(x_t,x_0)
=
\frac{\sqrt{\bar{\alpha}_{t-1}}\beta_t}{1-\bar{\alpha}_t}x_0
+
\frac{\sqrt{\alpha_t}(1-\bar{\alpha}_{t-1})}{1-\bar{\alpha}_t}x_t
$$

生成时没有真实 $x_0$，所以我们先通过噪声预测把它估出来：

$$
\hat{x}_0(x_t,t)=
\frac{x_t-\sqrt{1-\bar{\alpha}_t}\,\epsilon_\theta(x_t,t)}
{\sqrt{\bar{\alpha}_t}}
$$

再把它塞回逆向均值，得到一步采样：

$$
x_{t-1}=\mu_\theta(x_t,t)+\sigma_t z,\quad z\sim\mathcal{N}(0,I)
$$

在标准 DDPM 里，这个随机项不是装饰品。它来自后验方差，也就是说每一步逆向本来就是一个条件高斯采样问题，而不是一个单值映射问题。

这件事同时带来两个后果：

- 你很难随便跳步，因为定义本来就是一步接一步的马尔可夫链
- 即使网络完全固定，重复采样时路径也会因为每一步加的噪声而不同

DDPM 能生成，靠的是这条随机链。DDPM 慢，也正是慢在这条随机链。

## 从 DDPM 到 DDIM，真正松动的是“马尔可夫性”

DDIM 论文做的第一件聪明事，不是修改损失函数，也不是重新训练一个网络，而是换了一个问法：

> 训练时我们真正用到的，到底是整条前向马尔可夫链，还是只用到了各个时刻的边缘分布 $q(x_t|x_0)$？

答案是后者。

因为噪声预测训练只依赖这条闭式解：

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\,\epsilon
$$

也就是说，训练时我们根本不关心 $x_t$ 到底是不是通过

$$
q(x_t|x_{t-1})
$$

一级一级滚上来的；我们只关心在给定 $x_0$ 时，某个时间步的 $x_t$ 长得像不像

$$
\mathcal{N}\big(\sqrt{\bar{\alpha}_t}x_0,(1-\bar{\alpha}_t)I\big)
$$

这给了 DDIM 一个很大的操作空间：**你可以保留所有这些边缘分布不变，但把整条联合分布改成非马尔可夫的。**

一旦这么做，训练目标就还能原封不动地用，但采样过程不必再被 DDPM 的随机逆链锁死。

## 先把 DDPM 重写成“信号项 + 方向项 + 随机项”

要看清 DDIM 的公式从哪来，最好的办法不是死记论文里的结果，而是先把 DDPM 的状态写成“信号 + 残差”的形式。

由前向闭式解，

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\,\epsilon
$$

可直接解出噪声：

$$
\epsilon=
\frac{x_t-\sqrt{\bar{\alpha}_t}x_0}{\sqrt{1-\bar{\alpha}_t}}
$$

如果我们想写出某个合法的 $x_{t-1}$，只要它在给定 $x_0$ 时满足正确的边缘分布：

$$
q(x_{t-1}|x_0)=
\mathcal{N}\big(\sqrt{\bar{\alpha}_{t-1}}x_0, (1-\bar{\alpha}_{t-1})I\big)
$$

那么一个非常自然的参数化是：

$$
x_{t-1}
=
\sqrt{\bar{\alpha}_{t-1}}x_0
+
\sqrt{1-\bar{\alpha}_{t-1}-\sigma_t^2}\,\epsilon
+
\sigma_t z,
\quad z\sim\mathcal{N}(0,I)
$$

这条式子非常关键。它把 $x_{t-1}$ 拆成了三部分：

- 第一项是沿着干净样本 $x_0$ 的信号分量
- 第二项是沿着当前噪声方向 $\epsilon$ 的确定性分量
- 第三项是额外注入的新随机噪声

为什么这样写是合法的？因为在给定 $x_0$ 时，$\epsilon$ 和 $z$ 都是标准高斯，且相互独立，所以后两项合起来的方差正好是：

$$
\big(1-\bar{\alpha}_{t-1}-\sigma_t^2\big)I+\sigma_t^2 I
=
(1-\bar{\alpha}_{t-1})I
$$

因此它确实满足正确的边缘方差。

这一步已经把 DDIM 的核心露出来了：**只要边缘分布对，$\sigma_t$ 其实可以不唯一。**

## 用 $x_t$ 替换掉看不见的噪声，就得到 DDIM 的一般更新式

上式里还有一个不可直接使用的量：真实噪声 $\epsilon$。不过它已经可以由 $(x_t,x_0)$ 表达出来，因此代回去：

$$
x_{t-1}
=
\sqrt{\bar{\alpha}_{t-1}}x_0
+
\sqrt{1-\bar{\alpha}_{t-1}-\sigma_t^2}
\cdot
\frac{x_t-\sqrt{\bar{\alpha}_t}x_0}{\sqrt{1-\bar{\alpha}_t}}
+
\sigma_t z
$$

整理后可以写成条件分布：

$$
q_\sigma(x_{t-1}|x_t,x_0)
=
\mathcal{N}\big(x_{t-1}; \mu_\sigma(x_t,x_0), \sigma_t^2 I\big)
$$

其中

$$
\mu_\sigma(x_t,x_0)
=
\sqrt{\bar{\alpha}_{t-1}}x_0
+
\sqrt{\frac{1-\bar{\alpha}_{t-1}-\sigma_t^2}{1-\bar{\alpha}_t}}
\left(
x_t-\sqrt{\bar{\alpha}_t}x_0
\right)
$$

这就是 DDIM 家族的一般逆向更新。和 DDPM 对比，你会发现这里的自由度全塞进了 $\sigma_t$。

如果我们再用网络预测到的 $\hat{x}_0$ 或 $\epsilon_\theta$ 替换真实 $x_0,\epsilon$，就得到实际采样公式：

$$
x_{t-1}
=
\sqrt{\bar{\alpha}_{t-1}}\hat{x}_0
+
\sqrt{1-\bar{\alpha}_{t-1}-\sigma_t^2}\,\epsilon_\theta(x_t,t)
+
\sigma_t z
$$

其中

$$
\hat{x}_0=
\frac{x_t-\sqrt{1-\bar{\alpha}_t}\,\epsilon_\theta(x_t,t)}
{\sqrt{\bar{\alpha}_t}}
$$

到这里，DDPM 和 DDIM 已经能放在同一条公式里看了。差别不在网络，也不在训练损失，而在你选什么样的 $\sigma_t$。

## 选对 $\sigma_t$，DDPM 和 DDIM 其实是同一家人

DDIM 论文给出了一族由参数 $\eta$ 控制的方差选择：

$$
\sigma_t(\eta)
=
\eta
\sqrt{
\frac{1-\bar{\alpha}_{t-1}}{1-\bar{\alpha}_t}
\left(
1-\frac{\bar{\alpha}_t}{\bar{\alpha}_{t-1}}
\right)
}
$$

注意到

$$
\frac{\bar{\alpha}_t}{\bar{\alpha}_{t-1}}=\alpha_t
$$

所以

$$
\sigma_t^2(\eta)
=
\eta^2
\frac{1-\bar{\alpha}_{t-1}}{1-\bar{\alpha}_t}
(1-\alpha_t)
=
\eta^2
\frac{1-\bar{\alpha}_{t-1}}{1-\bar{\alpha}_t}\beta_t
$$

当 $\eta=1$ 时，

$$
\sigma_t^2(1)=
\frac{1-\bar{\alpha}_{t-1}}{1-\bar{\alpha}_t}\beta_t
=
\tilde{\beta}_t
$$

这正好就是 DDPM 后验方差。

换句话说：

- $\eta=1$ 时，你回到了 DDPM 风格的随机采样
- $0<\eta<1$ 时，你得到一条噪声更小、随机性更弱的中间路径
- $\eta=0$ 时，随机项彻底消失，采样变成确定性映射

这就是 DDPM 到 DDIM 最重要的一步过渡。它不是“发明了一个完全不同的模型”，而是发现 DDPM 只是更大一族采样路径中的一个特例。

## 当 $\eta=0$ 时，为什么会变成确定性的 implicit model

把 $\sigma_t=0$ 代回上面的更新式，得到：

$$
x_{t-1}
=
\sqrt{\bar{\alpha}_{t-1}}\hat{x}_0
+
\sqrt{1-\bar{\alpha}_{t-1}}\,\epsilon_\theta(x_t,t)
$$

再把 $\hat{x}_0$ 展开：

$$
x_{t-1}
=
\sqrt{\bar{\alpha}_{t-1}}
\frac{x_t-\sqrt{1-\bar{\alpha}_t}\,\epsilon_\theta(x_t,t)}
{\sqrt{\bar{\alpha}_t}}
+
\sqrt{1-\bar{\alpha}_{t-1}}\,\epsilon_\theta(x_t,t)
$$

这时 $x_{t-1}$ 完全由当前状态 $x_t$ 和网络预测 $\epsilon_\theta(x_t,t)$ 决定，不再需要重新采一个高斯噪声 $z$。于是整条链变成：

$$
x_T \mapsto x_{T-1} \mapsto \cdots \mapsto x_0
$$

的确定性映射。

这就是 DDIM 里 “implicit” 的意思。它不是显式地在每一步采样一个新的随机变量，而是由当前状态通过一个确定性规则隐式地定义前一个状态。

这件事带来两个非常实际的性质。

第一，**同一个初始噪声对应一条固定生成轨迹**。你不再会因为中间每一步重新采样而得到完全不同的路径。

第二，**跳步变得自然很多**。因为你不再依赖“每一步后验采样都得精确补一份噪声”，而是在沿着一个一致的、由网络定义的去噪轨迹前进。

## 为什么 DDIM 不需要重新训练

这其实是用户第一次接触 DDIM 时最容易困惑的地方。既然你已经把采样过程换了，为什么训练还不用动？

原因说透了其实非常朴素：DDPM 的标准训练目标只依赖

$$
q(x_t|x_0)=
\mathcal{N}\big(\sqrt{\bar{\alpha}_t}x_0,(1-\bar{\alpha}_t)I\big)
$$

而不依赖整条联合分布到底是不是 DDPM 原来那条马尔可夫链。

只要你构造的新过程仍然保有这些相同的边缘分布，那么训练时：

1. 采样 $x_0$
2. 采样时间步 $t$
3. 采样噪声 $\epsilon$
4. 构造

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\epsilon
$$

5. 继续做噪声预测 MSE

整个流程一项都不用改。

从这个角度看，DDIM 最漂亮的地方是：它把“训练目标”和“采样路径”这两件在 DDPM 里绑得很紧的东西拆开了。训练还是原来那套，采样却可以有更大的设计自由度。

## 为什么 DDIM 可以少步采样

现在可以回答最表层、但最常见的问题了：为什么 DDIM 往往能显著减少采样步数？

不是因为网络突然更强了，而是因为 DDIM 的更新式允许你把原本长度为 $T$ 的时间网格，换成一个更稀疏的子序列：

$$
\tau_1 < \tau_2 < \cdots < \tau_S,\quad S \ll T
$$

然后直接在这些时间点之间跳：

$$
x_{\tau_S}\to x_{\tau_{S-1}}\to \cdots \to x_{\tau_1}
$$

对于任意相邻的两个保留时间点 $(\tau_i,\tau_{i-1})$，仍然使用同样的更新结构：

$$
x_{\tau_{i-1}}
=
\sqrt{\bar{\alpha}_{\tau_{i-1}}}\hat{x}_0
+
\sqrt{1-\bar{\alpha}_{\tau_{i-1}}-\sigma_{\tau_i}^2}\,\epsilon_\theta(x_{\tau_i},\tau_i)
+
\sigma_{\tau_i} z
$$

当 $\eta=0$ 时，这种跳步尤其干净，因为没有额外随机项要补偿。你实际上是在用一个更粗的离散步长，沿着同一条隐式去噪轨迹往回走。

当然，步数砍得太狠还是会坏。因为网络虽然能在稀疏时间点上给出方向，但方向误差会在大步长下累积。DDIM 只是让你有资格少走楼梯，不代表你可以直接从楼顶跳到一层还毫发无损。

## 从概率链到隐式轨迹，这才是 DDPM 到 DDIM 的真正转变

如果把这段演化压成一句话，那就是：

> DDPM 把生成看成一条随机马尔可夫逆链；DDIM 发现，只要保住相同的时刻边缘分布，逆过程并不一定非得是这条随机链，它也可以是一条由噪声预测模型诱导出的确定性或半确定性轨迹。

这个转变很重要，因为它改变的不是局部技巧，而是你看待 diffusion sampling 的方式。

在 DDPM 里，直觉是：

- 每一步都在拟合一个局部条件高斯
- 每一步都要重新采样
- 生成是一串随机校正

到了 DDIM，直觉变成：

- 网络先从 $x_t$ 里恢复一个 $\hat{x}_0$
- 再根据 $\hat{x}_0$ 和当前噪声方向决定前一个状态
- 整个过程可以是一条稳定、连续、几乎像 ODE 一样的去噪轨迹

也正因为这层视角变化，后面很多工作才会自然地继续往下走：score-based SDE/ODE、probability flow ODE、DPM-Solver，本质上都在继续研究“扩散采样到底是随机链，还是某种可数值积分的连续流”这个问题。

## 如果你只想记住 DDPM 到 DDIM 的四条式子

第一条，DDPM 的前向闭式解：

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\epsilon
$$

第二条，由噪声预测恢复干净样本：

$$
\hat{x}_0=
\frac{x_t-\sqrt{1-\bar{\alpha}_t}\epsilon_\theta(x_t,t)}
{\sqrt{\bar{\alpha}_t}}
$$

第三条，DDIM 的一般更新式：

$$
x_{t-1}
=
\sqrt{\bar{\alpha}_{t-1}}\hat{x}_0
+
\sqrt{1-\bar{\alpha}_{t-1}-\sigma_t^2}\,\epsilon_\theta(x_t,t)
+
\sigma_t z
$$

第四条，控制随机性的方差参数：

$$
\sigma_t(\eta)
=
\eta
\sqrt{
\frac{1-\bar{\alpha}_{t-1}}{1-\bar{\alpha}_t}
\left(
1-\frac{\bar{\alpha}_t}{\bar{\alpha}_{t-1}}
\right)
}
$$

它们串起来就是完整主线：

- DDPM 先定义随机前向扩散，再学习随机逆向去噪
- 训练真正依赖的是各时刻边缘分布，而不是整条前向链的具体联合结构
- DDIM 保住这些边缘分布不变，把逆向采样改写成一族更自由的更新公式
- 当 $\eta=0$ 时，采样退化成确定性隐式映射，因此更适合少步生成

如果你已经把这篇里的公式吃透，下一步最值得接的是两件事：

- 从 DDIM 继续走到 probability flow ODE，看看“确定性扩散采样”在连续时间里长什么样
- 再往下看 DPM-Solver，理解为什么高阶数值积分能进一步减少步数

DDIM 的价值，从来不只是“更快”。它真正做对的，是把一件原本看起来只能随机、只能逐步做的事情，重新写成了一个更可控的动力系统问题。
