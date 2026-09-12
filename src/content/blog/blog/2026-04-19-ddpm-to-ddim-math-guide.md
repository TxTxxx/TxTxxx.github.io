---
title: DDIM 原理：从 DDPM 的随机逆扩散到确定性采样
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

# DDIM 原理：从 DDPM 的随机逆扩散到确定性采样

DDIM 可以复用 DDPM 的噪声预测网络，改变采样更新和时间网格，从而减少生成时的网络调用。它保留各时刻的条件边缘分布 $q(x_t|x_0)$，重新构造联合过程，而不是直接删去 DDPM 的若干采样步骤。

只要每个时刻的边缘分布 $q(x_t|x_0)$ 保持不变，训练时的噪声预测目标就还能成立。DDIM 正是沿着这条思路，把 DDPM 的随机逆扩散改写成了一族更自由的采样过程。

下面先列出 DDPM 的后验，再推导 DDIM 的更新式，并区分控制随机性的 $\eta$ 与控制计算量的采样步数。

![DDPM forward diffusion and reverse denoising process](/images/ddpm-to-ddim-cover.png)

## DDPM 的主要瓶颈为什么在采样链

DDPM 的前向转移为：

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

训练无需顺序模拟前向链。生成则需要从

$$
x_T\sim \mathcal{N}(0,I)
$$

一路往回采：

$$
x_T \to x_{T-1} \to \cdots \to x_1 \to x_0
$$

每一步依赖前一步的输出，需要再次调用网络。长采样链的成本主要来自这些顺序的网络计算。

## DDPM 的逆向一步为什么带随机性

给定原图时，DDPM 的前向链有以下可计算后验（$t>1$）：

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

将它代入逆向均值，得到一步采样：

$$
x_{t-1}=\mu_\theta(x_t,t)+\sigma_t z,\quad z\sim\mathcal{N}(0,I)
$$

标准 DDPM 的高斯逆向转移带有方差，$\sigma_t z$ 用于从该分布采样；最后一步通常不再加噪声。

这件事同时带来两个后果：

- 你很难随便跳步，因为定义本来就是一步接一步的马尔可夫链
- 即使网络完全固定，重复采样时路径也会因为每一步加的噪声而不同

减少网络调用需要调整转移规则，仅去掉随机项并不能减少采样步数。

## DDIM 如何放松 DDPM 的马尔可夫约束

噪声预测训练使用各时刻的 $q(x_t|x_0)$，并不需要抽取整条前向轨迹。输入由这条公式构造：

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\,\epsilon
$$

训练中不需要通过

$$
q(x_t|x_{t-1})
$$

逐步得到 $x_t$，只需要它在给定 $x_0$ 时服从

$$
\mathcal{N}\big(\sqrt{\bar{\alpha}_t}x_0,(1-\bar{\alpha}_t)I\big)
$$

因此，可以保留这些边缘分布，重新定义非马尔可夫的联合过程。原有的简化噪声预测目标仍可使用，采样更新则可以改变。

## 如何把 DDPM 更新式拆成信号项、方向项和随机项

先将带噪状态分解为数据信号和噪声两部分。

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

可采用以下参数化，其中要求 $0\leq\sigma_t^2\leq1-\bar{\alpha}_{t-1}$：

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

更新中的三项分别为：

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

在上述取值范围内，不同的 $\sigma_t$ 可以给出相同的条件边缘方差。

## DDIM 的一般更新式如何得到

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

$\sigma_t$ 控制这族更新中新增噪声的大小。

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

同一个噪声预测网络可以用于这些更新，无需为每个 $\sigma_t$ 单独训练。

## $\sigma_t$ 如何连接 DDPM 和 DDIM

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

在完整时间网格上，$\eta=1$ 对应使用 $\tilde{\beta}_t$ 方差的 DDPM 更新。它不等同于所有其他方差设定的 DDPM 实现。

## 为什么 $\eta=0$ 时会得到确定性 implicit model

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

固定网络和时间网格后，相同的初始噪声对应相同的轨迹。不同初值仍然产生不同样本，因此确定性更新不意味着生成分布退化为一个样本。

跳步需要使用跨时间点的更新公式，下面单独讨论。

## 为什么 DDIM 不需要重新训练网络

复用网络的条件是噪声调度与对应输入分布保持一致。简化噪声预测目标使用

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

这个训练流程不依赖采样时采用的 $\eta$。

## 为什么 DDIM 可以用更少步数采样

DDIM 可以在原本长度为 $T$ 的时间网格中选取较稀疏的子序列：

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

这里的 $\sigma_{\tau_i}$ 也要用保留的两个时间点重新计算，不能直接套原网格相邻步的值。$\eta=0$ 时随机项消失，但改变网格仍会改变离散采样轨迹。

减少步数会放大预测误差和离散化误差的影响。实际可用的步数需要结合模型和质量要求测量。

## 比较采样器时要固定哪些条件

DDIM 改的是采样过程，噪声预测网络可以保持不变。做对照时，先固定模型、初始噪声和噪声调度，再分别调整时间网格与 $\eta$，记录网络调用次数和生成质量。

这样可以区分少步采样带来的误差与新增随机噪声带来的变化。若继续研究 probability flow ODE 或 DPM-Solver，可以比较它们如何构造更新、如何控制数值误差，而不只比较名义上的采样步数。
