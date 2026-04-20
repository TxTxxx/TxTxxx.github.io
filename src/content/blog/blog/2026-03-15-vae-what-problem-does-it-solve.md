---
title: 普通自编码器会重建，不会生成：VAE 到底解决了什么问题
date: 2026-03-15
summary: 从隐变量模型、ELBO、KL 散度到重参数化技巧，系统解释 VAE 为什么能做生成而普通自编码器做不到。
tags:
  - vae
  - generative-models
  - deep-learning
cover_image: /images/vae-cover.png
cover_alt: Diagram illustrating variational autoencoder latent sampling and generation
draft: false
---

# 普通自编码器会重建，不会生成：VAE 到底解决了什么问题

普通自编码器看起来已经很像生成模型了。你把一张图片塞进编码器，得到一个低维向量；再把这个向量塞进解码器，图片就回来了。问题是，只要你真的在 latent space 里随机采样一次，通常就会得到一张垃圾图。重建和生成，差得没你想的那么近。

VAE 的关键也不是“给自编码器加点噪声”。它做的事更根本一些：把图像生成写成一个显式的隐变量概率模型，然后用一个可训练的近似后验去逼近原本算不出来的后验分布。ELBO、重参数化、KL 散度，这三样东西都不是装饰件，少一个都不成立。

如果你之前看过不少 VAE 文章，但读完还是停留在“编码器输出均值和方差，损失函数是重建误差加 KL”这个级别，那不是你的问题。很多文章把结论背了一遍，却跳过了真正难的那一步：为什么这个目标函数会长成这样。

## 普通自编码器为什么不能直接拿来生成图片

先看最熟悉的自编码器（Autoencoder, AE）。它包含两个映射：

- 编码器：$f_\phi(x) -> h$
- 解码器：$g_\theta(h) -> \hat{x}$

训练目标通常是让重建误差尽可能小：

$$
\min_{\phi,\theta} \mathcal{L}_{AE}(x, \hat{x})
$$

例如最常见的均方误差：

$$
\mathcal{L}_{AE} = \|x - \hat{x}\|^2
$$

这套东西很适合做压缩、降噪和表示学习，但它天然不保证“可采样”。原因很直接：

第一，AE 学到的是从训练样本到训练样本的确定性映射。编码器把每个输入 $x$ 映射到 latent space 里的某个点 $h$，但这些点之间的空白区域没有任何约束。你能保证训练样本附近重建正常，不能保证两个样本中间的区域也有意义。

第二，AE 没有规定 latent code 应该服从什么分布。你训练完之后，确实能收集到一堆编码向量，但它们可能是很碎的一团点云，可能有洞，可能分布极不规则。你如果从标准正态里随便采一个向量，再扔给解码器，解码器大概率会盯着你说一句：“这地方我训练时没见过。”

这就是普通 AE 的核心问题：它优化的是重建，不是生成。重建只要求“输入什么，尽量还原什么”；生成要求的是“从一个已知且可采样的分布里采样，也能生成合理样本”。这两件事不是一回事。

## 把图像生成问题写成隐变量模型

VAE 的第一步不是调网络结构，而是先把问题改写成一个隐变量模型（latent variable model）。

我们假设每张观测到的图像 $x$ 背后，都对应一个低维隐变量 $z$。这个 $z$ 不直接等于“笑容”“姿态”“光照”这些人类可读特征，但可以理解成它们的某种连续抽象表示。生成过程写成：

$$
z \sim p(z), \quad x \sim p_\theta(x|z)
$$

这里有两个核心对象：

- $p(z)$：隐变量的先验分布（prior）
- $p_\theta(x|z)$：给定隐变量生成观测的条件分布

通常我们取

$$
p(z) = \mathcal{N}(0, I)
$$

这不是因为真实世界里的图像“本来就来自标准正态”，而是因为它简单、连续、各向同性、方便采样，也方便后续推导。机器学习里很多好用的假设都不是“绝对真实”，而是“足够好且能算”。

一旦这样建模，整套生成逻辑就清楚了：

1. 先从先验 $p(z)$ 采样一个隐变量 $z$
2. 再从条件分布 $p_\theta(x|z)$ 生成图像 $x$

联合分布因此写成：

$$
p_\theta(x, z) = p_\theta(x|z)p(z)
$$

如果你的目标是最大化训练数据的似然，那就要最大化每个样本的边缘对数似然：

$$
\log p_\theta(x) = \log \int p_\theta(x, z)\,dz
= \log \int p_\theta(x|z)p(z)\,dz
$$

到这里，VAE 还是一个很正常的概率模型。真正麻烦的部分现在才开始。

## 真正难的不是生成，而是后验 $ p(z|x) $ 算不出来

如果我们知道一张图像 $x$，最自然的问题是：什么样的隐变量 $z$ 最可能生成它？这对应后验分布：

$$
p_\theta(z|x) = \frac{p_\theta(x|z)p(z)}{p_\theta(x)}
$$

问题卡在分母：

$$
p_\theta(x) = \int p_\theta(x|z)p(z)\,dz
$$

这个积分通常没有闭式解。只要解码器 $p_\theta(x|z)$ 由神经网络参数化，积分就基本别想手算。于是两个问题同时出现了：

- 你没法直接算 $\log p_\theta(x)$，所以不能直接做最大似然训练
- 你也没法直接算 $p_\theta(z|x)$，所以不能直接知道“这张图像对应什么隐变量”

这就是 VAE 必须引入近似后验的原因。

我们新引入一个分布：

$$
q_\phi(z|x)
$$

它由编码器参数化，用来逼近真实后验 $p_\theta(z|x)$。注意这里的角色分工：

- $p(z)$ 是先验，描述生成前你对 $z$ 的假设
- $p_\theta(x|z)$ 是解码器，描述如何由 $z$ 生成 $x$
- $q_\phi(z|x)$ 是编码器，描述给定 $x$ 时，可能对应哪些 $z$

很多中文资料会把这三者混成“隐空间分布”，然后整篇文章越讲越糊。别混。它们不是一个东西。

## ELBO 不是魔法，它只是给 $ \log p(x) $ 找了一个可优化下界

现在开始推导 VAE 最核心的目标函数。

我们的目标原本是最大化 $\log p_\theta(x)$。虽然它不好直接算，但我们可以把任意一个分布 $q_\phi(z|x)$ 乘进去再除回来：

$$
\log p_\theta(x)
= \log \int q_\phi(z|x)\frac{p_\theta(x,z)}{q_\phi(z|x)}dz
$$

把积分看成对 $q_\phi(z|x)$ 的期望：

$$
\log p_\theta(x)
= \log \mathbb{E}_{q_\phi(z|x)}
\left[\frac{p_\theta(x,z)}{q_\phi(z|x)}\right]
$$

因为 $\log$ 是凹函数，对它使用 Jensen 不等式：

$$
\log \mathbb{E}[Y] \ge \mathbb{E}[\log Y]
$$

于是得到

$$
\log p_\theta(x)
\ge
\mathbb{E}_{q_\phi(z|x)}
\left[
\log \frac{p_\theta(x,z)}{q_\phi(z|x)}
\right]
$$

这个下界就叫 Evidence Lower Bound，也就是 ELBO：

$$
\mathcal{L}_{ELBO}(x)
=
\mathbb{E}_{q_\phi(z|x)}
\left[
\log \frac{p_\theta(x,z)}{q_\phi(z|x)}
\right]
$$

再把联合分布展开：

$$
p_\theta(x,z) = p_\theta(x|z)p(z)
$$

得到

$$
\mathcal{L}_{ELBO}(x)
=
\mathbb{E}_{q_\phi(z|x)}
\left[
\log p_\theta(x|z) + \log p(z) - \log q_\phi(z|x)
\right]
$$

按期望拆开：

$$
\mathcal{L}_{ELBO}(x)
=
\mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)]
-
\mathrm{KL}\big(q_\phi(z|x)\|p(z)\big)
$$

这就是 VAE 最常见的那一版目标函数。

它的含义非常具体：

- $\mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)]$：重建项，要求从采样得到的 $z$ 能把输入 $x$ 解释回来
- $\mathrm{KL}(q_\phi(z|x)\|p(z))$：正则项，要求编码器给出的近似后验不要离先验太远

如果你想知道这个下界和真实对数似然到底差多少，可以继续推一次：

$$
\mathrm{KL}\big(q_\phi(z|x)\|p_\theta(z|x)\big)
=
\mathbb{E}_{q_\phi(z|x)}
\left[
\log \frac{q_\phi(z|x)}{p_\theta(z|x)}
\right]
$$

把贝叶斯公式

$$
p_\theta(z|x)=\frac{p_\theta(x,z)}{p_\theta(x)}
$$

代入：

$$
\mathrm{KL}\big(q_\phi(z|x)\|p_\theta(z|x)\big)
=
\mathbb{E}_{q_\phi(z|x)}
\left[
\log q_\phi(z|x) - \log p_\theta(x,z) + \log p_\theta(x)
\right]
$$

因为 $\log p_\theta(x)$ 与 $z$ 无关，可以移出期望：

$$
\mathrm{KL}\big(q_\phi(z|x)\|p_\theta(z|x)\big)
=
\log p_\theta(x)
-
\mathcal{L}_{ELBO}(x)
$$

所以：

$$
\log p_\theta(x)
=
\mathcal{L}_{ELBO}(x)
+
\mathrm{KL}\big(q_\phi(z|x)\|p_\theta(z|x)\big)
$$

这条式子说明两件事：

第一，ELBO 确实是下界，因为 KL 散度永远非负。

第二，最大化 ELBO 不只是“找个替代目标凑合训”，它等价于同时做两件事：

- 尽量提高数据似然
- 尽量让近似后验 $q_\phi(z|x)$ 接近真实后验 $p_\theta(z|x)$

这就是“变分推断”里那个“变分”到底在变什么。我们不是直接算真实后验，而是在一类可计算的分布里，找一个最接近它的。

## 重参数化技巧如何绕开“采样不可导”这个硬伤

到现在为止，目标函数已经有了，但训练还差最后一道坎：$q_\phi(z|x)$ 里要采样，而“采样”本身对参数不可导。

假设编码器输出一个高斯分布：

$$
q_\phi(z|x)=\mathcal{N}(z;\mu_\phi(x), \mathrm{diag}(\sigma_\phi^2(x)))
$$

如果你直接写

$$
z \sim \mathcal{N}(\mu_\phi(x), \mathrm{diag}(\sigma_\phi^2(x)))
$$

然后把 $z$ 送进解码器，反向传播会卡住。因为梯度不知道怎么穿过“随机采样”这个操作回到 $\mu_\phi(x)$ 和 $\sigma_\phi(x)$。

VAE 的经典修复方式是重参数化（reparameterization trick）：

$$
\epsilon \sim \mathcal{N}(0, I), \quad
z = \mu_\phi(x) + \sigma_\phi(x)\odot \epsilon
$$

这里 $\odot$ 表示逐元素乘法。

这样改写之后，随机性来自固定分布 $\epsilon \sim \mathcal{N}(0,I)$，而 $z$ 本身是 $\mu_\phi(x)$ 和 $\sigma_\phi(x)$ 的确定性函数。于是梯度路径就通了：

$$
(\phi, \theta)
\rightarrow \mu_\phi(x), \sigma_\phi(x)
\rightarrow z
\rightarrow \log p_\theta(x|z)
$$

这一步经常被一句“为了让采样可导”轻轻带过，但它其实非常关键。没有重参数化，VAE 也不是完全不能训，但你得用高方差的梯度估计方法，训练会痛苦很多。深度学习里能优雅解决的问题，通常都比硬上 Monte Carlo 梯度好。

工程实现里，编码器通常不会直接输出 $\sigma$，而是输出 $\log \sigma^2$，也常写成 $\logvar$。原因有两个：

- 方差必须为正，直接输出实数再指数化更方便
- 数值更稳定，尤其是在训练初期

于是常见实现是：

$$
\sigma = \exp\left(\frac{1}{2}\log \sigma^2\right)
$$

然后再做重参数化：

$$
z = \mu + \exp\left(\frac{1}{2}\log \sigma^2\right)\odot \epsilon
$$

## KL 项的闭式解到底从哪里来

到这一步，VAE 的目标函数已经可以写成：

$$
\max_{\phi,\theta}
\mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)]
-
\mathrm{KL}\big(q_\phi(z|x)\|p(z)\big)
$$

训练时通常写成最小化负 ELBO：

$$
\mathcal{L}_{VAE}
=
-\mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)]
+
\mathrm{KL}\big(q_\phi(z|x)\|p(z)\big)
$$

现在来推 KL 项的闭式解。假设：

$$
q_\phi(z|x) = \mathcal{N}(\mu, \mathrm{diag}(\sigma^2)),
\quad
p(z)=\mathcal{N}(0, I)
$$

为了简洁，设 latent dimension 是 $d$。根据 KL 散度定义：

$$
\mathrm{KL}(q\|p)
=
\mathbb{E}_{q(z)}
\left[
\log \frac{q(z)}{p(z)}
\right]
=
\mathbb{E}_{q(z)}[\log q(z)] - \mathbb{E}_{q(z)}[\log p(z)]
$$

先写出两个分布的对数密度。

对角高斯 $q(z)$ 的对数密度是：

$$
\log q(z)
=
-\frac{d}{2}\log(2\pi)
-\frac{1}{2}\sum_{i=1}^d \log \sigma_i^2
-\frac{1}{2}\sum_{i=1}^d \frac{(z_i-\mu_i)^2}{\sigma_i^2}
$$

标准正态先验 $p(z)$ 的对数密度是：

$$
\log p(z)
=
-\frac{d}{2}\log(2\pi)
-\frac{1}{2}\sum_{i=1}^d z_i^2
$$

所以

$$
\mathrm{KL}(q\|p)
=
\mathbb{E}_q\left[
-\frac{1}{2}\sum_{i=1}^d \log \sigma_i^2
-\frac{1}{2}\sum_{i=1}^d \frac{(z_i-\mu_i)^2}{\sigma_i^2}
+\frac{1}{2}\sum_{i=1}^d z_i^2
\right]
$$

常数项 $-\frac{d}{2}\log(2\pi)$ 抵消了。把求和和期望拆开：

$$
\mathrm{KL}(q\|p)
=
\frac{1}{2}\sum_{i=1}^d
\left(
-\log \sigma_i^2
- \mathbb{E}_q\left[\frac{(z_i-\mu_i)^2}{\sigma_i^2}\right]
+ \mathbb{E}_q[z_i^2]
\right)
$$

接下来分别算两项期望。

第一项：

$$
\mathbb{E}_q\left[\frac{(z_i-\mu_i)^2}{\sigma_i^2}\right]
=
\frac{1}{\sigma_i^2}\mathbb{E}_q[(z_i-\mu_i)^2]
=
\frac{1}{\sigma_i^2}\mathrm{Var}(z_i)
= 1
$$

因为在 $q(z)$ 下，$z_i$ 的方差就是 $\sigma_i^2$。

第二项：

$$
\mathbb{E}_q[z_i^2]
=
\mathrm{Var}(z_i) + (\mathbb{E}_q[z_i])^2
=
\sigma_i^2 + \mu_i^2
$$

代回去：

$$
\mathrm{KL}(q\|p)
=
\frac{1}{2}\sum_{i=1}^d
\left(
-\log \sigma_i^2 - 1 + \sigma_i^2 + \mu_i^2
\right)
$$

整理一下：

$$
\boxed{
\mathrm{KL}(q_\phi(z|x)\|p(z))
=
\frac{1}{2}\sum_{i=1}^d
\left(
\mu_i^2 + \sigma_i^2 - \log \sigma_i^2 - 1
\right)
}
$$

这就是实现里最常见的 KL 项公式。

如果你看到另一种写法：

$$
-\frac{1}{2}\sum_{i=1}^d
\left(
1 + \log \sigma_i^2 - \mu_i^2 - \sigma_i^2
\right)
$$

那是完全等价的，只是把负号提到前面了。

## 重建项到底在优化什么

很多教程会把 VAE 损失写成“重建误差 + KL”，然后重建误差随手塞个 MSE 或 BCE。这么写能跑，但会掩盖真正的概率意义。

VAE 的重建项本质上是：

$$
\mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)]
$$

它不是“经验上让图片长得像”，而是在最大化给定 $z$ 时观测 $x$ 的条件对数似然。

如果你假设像素值是伯努利分布，那么负对数似然会对应 BCE。

如果你假设像素值在高斯噪声下生成，那么负对数似然会对应 MSE 形式。

所以 BCE 和 MSE 不是拍脑袋选的，它们背后对应的是你对 $p_\theta(x|z)$ 的建模假设。很多实现里这一步被简化得过于粗暴，最后大家误以为“VAE 的损失就是玄学拼盘”。其实不是，它是一套完整的概率建模逻辑。

## VAE 到底学到了什么，又牺牲了什么

现在我们可以回头看 KL 项到底在干什么。

它不是在粗暴地要求“每个样本的 latent code 都得像标准正态”。更准确地说，它要求对每个输入 $x$，编码器产生的近似后验 $q_\phi(z|x)$ 不要离先验 $p(z)$ 太远。这样训练时你从编码器拿到的 latent 分布，和生成时你从先验直接采样的 latent 分布，才不会完全脱节。

这也解释了为什么 VAE 的 latent space 通常更平滑、可插值。普通 AE 往往只在训练样本附近放下一堆孤立点；VAE 则通过 KL 正则把这些点云往一个连续、可采样的区域里压。

代价也很明显。重建项希望保留细节，KL 项希望分布规整，这两者天然存在张力。KL 压得太重，模型会倾向于忽略 latent variable，出现 posterior collapse；KL 压得太轻，latent space 又会重新变得支离破碎。标准 VAE 生成结果偏模糊，往往不是你代码写差了，而是最大似然式目标在像素空间里的典型表现。

这就是为什么后来的生成模型会往不同方向走：

- GAN 更强调样本锐利度，但训练不稳定，概率解释也弱
- Diffusion 生成质量更高，但采样慢、训练和推理成本更重
- VAE 的优势是训练稳定、概率语义清楚、latent space 结构化

它不是“最会画图”的模型，但它经常是“最容易解释自己在干什么”的模型。对于一个要认真理解生成模型的人来说，这很重要。

## 如果你只记住三件事

第一，VAE 的起点不是“让 AE 更随机”，而是把数据生成写成隐变量概率模型。

第二，ELBO 之所以出现，不是因为大家喜欢发明新缩写，而是因为 $\log p(x)$ 和真实后验都算不出来，只能转而优化一个可计算下界。

第三，VAE 的损失函数不是随手拼出来的：

$$
\mathcal{L}_{VAE}
=
-\mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)]
+
\mathrm{KL}(q_\phi(z|x)\|p(z))
$$

第一项负责“这张图要能解释回来”，第二项负责“这个 latent space 要真的能采样”。

如果你下一步还想继续往下挖，最值得看的三个方向是：

- `beta-VAE`：当你故意放大 KL 项时，会得到什么样的可解释表示
- `posterior collapse`：为什么有些 VAE 学着学着就把 `z` 当空气
- `IWAE`：怎么把 ELBO 这个下界再抬高一点

VAE 不是生成模型的终点，但它通常是你第一次真正接触“深度学习 + 概率推断”交叉点的地方。这个地方一旦想明白，后面很多模型都会顺眼很多。
