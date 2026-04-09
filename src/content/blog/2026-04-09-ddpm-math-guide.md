---
title: DDPM 不是“往图上加噪声”这么简单：从前向扩散到噪声预测的数学主线
date: 2026-04-09
summary: 从前向扩散、逆向后验到噪声预测目标，系统梳理 DDPM 为什么能训练、能采样以及其数学主线到底是什么。
tags:
  - ddpm
  - diffusion-models
  - generative-models
featured_slot: 1
cover_image: /images/ddpm-cover.png
cover_alt: Diagram illustrating DDPM forward diffusion and reverse denoising process
draft: false
---

# DDPM 不是“往图上加噪声”这么简单：从前向扩散到噪声预测的数学主线

扩散模型最容易被讲坏的地方，是大家都爱说一句正确但没什么用的话：先把图像一步步加噪，再把噪声一步步去掉。问题是，这句话只解释了故事，不解释为什么这个故事能训练、能采样、还能在高维空间里跑得比很多老生成模型更稳定。

DDPM 真正厉害的地方，不是“加噪”这个动作本身，而是它把一个难解的生成问题，拆成了一串条件高斯分布上的局部预测问题。你不再要求模型一步从随机噪声直接画出一张脸，而是要求它在第 `t` 步只做一件事：把当前样本往更干净的方向推一点。听起来像作弊。某种意义上也确实是。

这篇文章不讲花哨应用，不讲采样加速 tricks，也不讲 Stable Diffusion 的工程堆料。我们只做一件事：把 DDPM 的数学骨架讲清楚，尤其是三条最关键的链路：

- 前向扩散为什么可以写成闭式解
- 逆向后验为什么会是高斯
- 训练目标为什么最后可以化成一个简单的噪声预测 MSE

## 直接从噪声生成图像太难，DDPM 选择先把图像毁掉

生成模型的核心任务，是学习数据分布 `q(x_0)`，然后从中采样新的样本。难点不在于“定义一个网络”，而在于你要让这个网络在高维像素空间里生成既合理又多样的结果。一步到位地做这件事，通常很难训，也很难解释。

DDPM 的策略是反过来想。既然“从纯噪声直接生成清晰图像”很难，那我们先构造一个简单到不能再简单的正向过程：不断往真实图像里加入高斯噪声，直到它变成一团标准正态噪声。这个过程我们完全自己定义，因此每一步分布都知道；然后再反过来学一个逆向过程，把噪声一点点去掉。

于是问题被拆成两个过程：

- 正向扩散过程（forward diffusion）：`x_0 -> x_1 -> ... -> x_T`
- 逆向生成过程（reverse process）：`x_T -> x_{T-1} -> ... -> x_0`

其中真正需要学习的只有逆向过程。正向过程是人造的、固定的、带公式的。这个设计非常重要，因为它让我们至少有一半系统是可控的。生成模型里，先把能控的部分控住，通常都是好事。

## 前向扩散不是乱加噪声，它是一个马尔可夫链

DDPM 把前向过程定义成一个长度为 `T` 的马尔可夫链：

$$
q(x_{1:T}|x_0)=\prod_{t=1}^T q(x_t|x_{t-1})
$$

每一步的转移分布定义为：

$$
q(x_t|x_{t-1})=\mathcal{N}\big(x_t;\sqrt{1-\beta_t}\,x_{t-1},\beta_t I\big)
$$

通常记

$$
\alpha_t = 1-\beta_t
$$

于是也可以写成采样形式：

$$
x_t=\sqrt{\alpha_t}x_{t-1}+\sqrt{1-\alpha_t}\,\epsilon_t,\quad \epsilon_t\sim\mathcal{N}(0,I)
$$

这里的 $\beta_t \in (0,1)$ 是第 `t` 步的噪声强度。它通常很小，并且随时间步递增。直觉上很好理解：

- 前期少加一点噪声，别一下把图像彻底打烂
- 后期多加一点噪声，让分布最终逼近标准正态

这个定义有两个非常好的性质。

第一，条件分布是高斯，计算方便。

第二，均值被 $\sqrt{\alpha_t}$ 缩小，方差补上 $1-\alpha_t$，所以总能量不会无脑爆炸。你如果只是每一步粗暴地做 $x_t=x_{t-1}+\sigma_t\epsilon$，那方差会一路堆上去，最后虽然也会乱，但乱得不够优雅，推导也不够好看。

## 闭式解是 DDPM 的第一块地基

如果前向过程只能一步一步采样，那训练会很麻烦。你每次想拿到某个 `x_t`，都得从 `x_0` 一路滚到第 `t` 步。DDPM 的一个关键优点是：这个链可以直接折叠成闭式解。

先展开前两步：

$$
x_1=\sqrt{\alpha_1}x_0+\sqrt{1-\alpha_1}\epsilon_1
$$

$$
x_2=\sqrt{\alpha_2}x_1+\sqrt{1-\alpha_2}\epsilon_2
$$

把 $x_1$ 代进去：

$$
x_2=\sqrt{\alpha_2\alpha_1}x_0+\sqrt{\alpha_2(1-\alpha_1)}\epsilon_1+\sqrt{1-\alpha_2}\epsilon_2
$$

后两项是独立高斯噪声的线性组合，因此仍然是高斯。它们的协方差相加，于是可合并成一项新的标准噪声 $\epsilon$：

$$
x_2=\sqrt{\alpha_1\alpha_2}x_0+\sqrt{1-\alpha_1\alpha_2}\,\epsilon,\quad \epsilon\sim\mathcal{N}(0,I)
$$

继续递推，就得到一般形式。定义累乘量：

$$
\bar{\alpha}_t=\prod_{s=1}^t \alpha_s
$$

那么：

$$
q(x_t|x_0)=\mathcal{N}\big(x_t;\sqrt{\bar{\alpha}_t}x_0,(1-\bar{\alpha}_t)I\big)
$$

等价的采样式是：

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\,\epsilon,\quad \epsilon\sim\mathcal{N}(0,I)
$$

这条式子值得你多看两眼。它意味着训练时如果我想随机挑一个时刻 `t`，直接构造这个时刻的带噪样本 `x_t`，根本不用真的跑 `t` 次马尔可夫链。一次公式代入就够了。

这也是 DDPM 训练可并行的关键原因之一。

顺便说清一个常见误解。有人会说“当前向步数足够大时，`x_T` 就等于纯噪声”。更准确的说法是：

$$
q(x_T|x_0)\approx \mathcal{N}(0,I)
$$

当 $\bar{\alpha}_T \to 0$ 时，

$$
\sqrt{\bar{\alpha}_T}x_0 \to 0,\quad 1-\bar{\alpha}_T \to 1
$$

所以 $x_T$ 的条件分布接近标准正态。不是“某一张图神奇地消失了”，而是它的信号占比被衰减到几乎看不见。

## 真正要学的，是逆向条件分布 $ q(x_{t-1}|x_t) $

如果前向过程是固定的，那生成时我们真正需要的是逆向过程：

$$
p_\theta(x_{0:T})=p(x_T)\prod_{t=1}^T p_\theta(x_{t-1}|x_t)
$$

其中通常设

$$
p(x_T)=\mathcal{N}(0,I)
$$

问题来了。正向过程里我们定义了 $q(x_t|x_{t-1})$，但生成时需要的是反方向的 $q(x_{t-1}|x_t)$。这两个不是简单互逆关系。因为前向里混入了噪声，信息已经丢了。

直接求

$$
q(x_{t-1}|x_t)
$$

很难，因为它依赖数据分布 `q(x_0)`。这正是扩散模型里最核心的技术点之一：直接的逆向分布不好算，但如果你额外知道原图 `x_0`，那后验

$$
q(x_{t-1}|x_t,x_0)
$$

居然是可以写成高斯的，而且均值和方差都有闭式解。

## 为什么 $ q(x_{t-1}|x_t,x_0) $ 是高斯

先写出与 $x_{t-1}$ 有关的两项：

$$
q(x_t|x_{t-1},x_0)=q(x_t|x_{t-1})
$$

$$
q(x_{t-1}|x_0)=\mathcal{N}\big(x_{t-1};\sqrt{\bar{\alpha}_{t-1}}x_0,(1-\bar{\alpha}_{t-1})I\big)
$$

于是根据贝叶斯公式，忽略和 $x_{t-1}$ 无关的归一化常数，有

$$
q(x_{t-1}|x_t,x_0)\propto q(x_t|x_{t-1})q(x_{t-1}|x_0)
$$

两项都是关于 $x_{t-1}$ 的高斯密度，乘起来仍然是高斯。因此：

$$
q(x_{t-1}|x_t,x_0)=\mathcal{N}(x_{t-1};\tilde{\mu}_t(x_t,x_0),\tilde{\beta}_t I)
$$

最后结果是：

$$
\tilde{\beta}_t=\frac{1-\bar{\alpha}_{t-1}}{1-\bar{\alpha}_t}\beta_t
$$

$$
\tilde{\mu}_t(x_t,x_0)
=
\frac{\sqrt{\bar{\alpha}_{t-1}}\beta_t}{1-\bar{\alpha}_t}x_0
+
\frac{\sqrt{\alpha_t}(1-\bar{\alpha}_{t-1})}{1-\bar{\alpha}_t}x_t
$$

这条均值公式本身就很有信息量。它说明逆向一步的最优均值不是只看 $x_t$，也不是只看 $x_0$，而是两者的线性组合。直觉上也对：你既需要当前 noisy sample，又需要关于原始干净样本的估计。

推导如果展开，本质上就是把两个高斯的指数项写出来，对 $x_{t-1}$ 的二次项和一次项配方。写到最后会得到标准高斯形式：

$$
\log q(x_{t-1}|x_t,x_0)
=
-\frac{1}{2\tilde{\beta}_t}\|x_{t-1}-\tilde{\mu}_t(x_t,x_0)\|^2 + C
$$

其中 $C$ 是与 $x_{t-1}$ 无关的常数。

如果你之前觉得扩散模型“像魔法”，那这里就是魔法拆穿的时刻。它没那么玄，核心只是：前向过程被设计成高斯链，所以很多后验还能保住高斯结构。

## 但生成时没有 $ x_0 $，所以我们得学会猜它

上面这个后验很好，可惜生成时用不了。因为在采样阶段你只有 `x_t`，没有真实的 `x_0`。于是 DDPM 做了一个自然的近似：训练一个网络去拟合逆向过程

$$
p_\theta(x_{t-1}|x_t)=\mathcal{N}(x_{t-1};\mu_\theta(x_t,t),\Sigma_\theta(x_t,t))
$$

原始 DDPM 通常把方差固定为某个预设值，比如 $\tilde{\beta}_t I$ 或 $\beta_t I$，重点学习均值：

$$
\mu_\theta(x_t,t)
$$

那网络到底应该直接预测什么？你有几种等价参数化：

- 直接预测 `x_0`
- 直接预测后验均值 $\tilde{\mu}_t$
- 预测噪声 $\epsilon$

DDPM 最经典的做法是预测噪声。这不是因为噪声听起来酷，而是因为它把训练目标变得非常干净。

从前向闭式解

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\epsilon
$$

可以直接解出

$$
x_0=\frac{1}{\sqrt{\bar{\alpha}_t}}
\left(
x_t-\sqrt{1-\bar{\alpha}_t}\epsilon
\right)
$$

把这个 $x_0$ 代回 $\tilde{\mu}_t(x_t,x_0)$，整理后可得：

$$
\tilde{\mu}_t(x_t,x_0)
=
\frac{1}{\sqrt{\alpha_t}}
\left(
x_t-\frac{\beta_t}{\sqrt{1-\bar{\alpha}_t}}\epsilon
\right)
$$

于是如果网络能预测出噪声

$$
\epsilon_\theta(x_t,t)\approx \epsilon
$$

我们就能构造逆向均值：

$$
\mu_\theta(x_t,t)
=
\frac{1}{\sqrt{\alpha_t}}
\left(
x_t-\frac{\beta_t}{\sqrt{1-\bar{\alpha}_t}}\epsilon_\theta(x_t,t)
\right)
$$

这一步很关键。它把“学习逆向分布”这件事，转成了“在给定 `x_t` 和 `t` 时，预测把 `x_0` 污染成 `x_t` 的那团噪声”。

## 训练目标为什么最后只剩一个 MSE

如果按概率模型的标准套路来，DDPM 的训练目标来自变分下界（ELBO）。原论文把负对数似然上界写成：

$$
\mathbb{E}_{q}\Big[
D_{KL}(q(x_T|x_0)\|p(x_T))
+
\sum_{t=2}^T D_{KL}\big(q(x_{t-1}|x_t,x_0)\|p_\theta(x_{t-1}|x_t)\big)
-\log p_\theta(x_0|x_1)
\Big]
$$

这式子第一次看通常只会让人想关掉网页。但它非常重要，因为它告诉你：训练本质上是在让模型学会每一步逆向条件分布。

当我们选择：

- $p_\theta(x_{t-1}|x_t)$ 为高斯
- 方差固定
- 均值通过噪声预测参数化

中间那些 KL 项可以化简成一个加权的噪声回归损失。进一步简化后，原论文采用的常见目标是：

$$
\mathcal{L}_{simple}
=
\mathbb{E}_{x_0,\epsilon,t}
\Big[
\|\epsilon-\epsilon_\theta(x_t,t)\|^2
\Big]
$$

其中

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\epsilon,\quad \epsilon\sim\mathcal{N}(0,I)
$$

训练流程于是变得异常直接：

1. 从数据中采样一张干净图像 $x_0$
2. 随机采样一个时间步 `t`
3. 采样高斯噪声 $\epsilon$
4. 用闭式解构造 `x_t`
5. 让网络根据 `(x_t,t)` 去预测 $\epsilon$
6. 用 MSE 训练

这就是 DDPM 训练看起来“只是在猜噪声”的原因。它不是拍脑袋的工程 trick，而是从 ELBO 一步步化简出来的一个干净参数化。

## 采样时模型到底在做什么

训练完成后，采样从纯噪声开始：

$$
x_T\sim\mathcal{N}(0,I)
$$

然后对 $t=T,T-1,\dots,1$ 依次执行：

$$
x_{t-1}=\mu_\theta(x_t,t)+\sigma_t z,\quad z\sim\mathcal{N}(0,I)
$$

其中当 `t>1` 时加噪声，当 `t=1` 时通常不再加噪。代入前面的均值参数化，就是：

$$
x_{t-1}
=
\frac{1}{\sqrt{\alpha_t}}
\left(
x_t-\frac{\beta_t}{\sqrt{1-\bar{\alpha}_t}}\epsilon_\theta(x_t,t)
\right)
+
\sigma_t z
$$

这个式子的物理意义并不复杂：

- $x_t$ 给你当前状态
- $\epsilon_\theta(x_t,t)$ 告诉你模型认为其中哪部分是噪声
- 前面那一大坨系数负责把“预测噪声”变成“朝更干净样本迈一步”
- 最后一项随机噪声保证采样仍然是随机过程，而不是塌成单一路径

所以 DDPM 采样不是“每步都生成一张完整图像”，而是“每步做一次带噪的校正”。把这个动作重复几百步，图像就一点点浮出来了。

## DDPM 到底好在哪，也到底慢在哪

到这里，DDPM 的核心优点已经很清楚了。

第一，它把高维生成问题拆成了很多个局部高斯去噪问题，训练稳定得多。

第二，前向过程是人为设计的，因此很多关键分布可以直接写公式，数学结构非常干净。

第三，噪声预测这个参数化非常自然，目标函数也简单，工程实现上不算折磨人。

但代价同样明显。

最主要的问题就是慢。标准 DDPM 往往需要几百到上千步采样。每一步都要过一遍网络，这和 GAN 那种一步出图完全不是一个成本级别。后来的 DDIM、DPM-Solver、Consistency Model，基本都在想办法解决这个问题。

还有一个容易被忽略的点：DDPM 的“简单损失”虽然好训，但它和最终采样质量之间并不是线性直觉关系。噪声调度、方差设定、时间步嵌入、网络结构，都会显著影响结果。扩散模型不是只靠一个漂亮公式就自动起飞的。

## 如果你只记住四条公式

如果这篇文章读到最后你脑子里只想留下最核心的结构，那就记住这四条。

前向一步：

$$
q(x_t|x_{t-1})=\mathcal{N}\big(x_t;\sqrt{\alpha_t}x_{t-1},(1-\alpha_t)I\big)
$$

前向闭式解：

$$
x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\epsilon
$$

逆向后验均值：

$$
\tilde{\mu}_t(x_t,x_0)
=
\frac{\sqrt{\bar{\alpha}_{t-1}}\beta_t}{1-\bar{\alpha}_t}x_0
+
\frac{\sqrt{\alpha_t}(1-\bar{\alpha}_{t-1})}{1-\bar{\alpha}_t}x_t
$$

训练目标：

$$
\mathcal{L}_{simple}
=
\mathbb{E}\big[\|\epsilon-\epsilon_\theta(x_t,t)\|^2\big]
$$

它们串起来就是 DDPM 的完整主线：

- 我们先把数据用一个已知高斯链逐步污染
- 再利用高斯结构推导出逆向一步应该长什么样
- 最后把这个逆向问题变成噪声预测

这就是为什么 DDPM 看起来像“逐步去噪”，但本质上是在做一个有严格概率结构支撑的生成建模问题。

如果你下一步继续往下学，最值得接上的三个话题是：

- DDIM：为什么不改训练也能大幅减少采样步数
- Score matching：扩散模型和 score-based model 到底是什么关系
- Latent diffusion：为什么 Stable Diffusion 不在像素空间直接扩散

这一篇先把骨架钉住。骨架一旦对了，后面的各种变体才不会看起来像随机拼装。
