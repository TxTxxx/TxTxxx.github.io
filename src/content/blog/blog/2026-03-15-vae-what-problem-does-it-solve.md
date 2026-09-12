---
title: VAE 解决了什么问题：从隐变量建模到 ELBO
date: 2026-03-15
summary: 推导 VAE 的 ELBO、重参数化和高斯 KL 项，区分重建目标与从先验采样的生成过程。
tags:
  - vae
  - generative-models
  - deep-learning
cover_image: /images/vae-cover.png
cover_alt: Diagram illustrating variational autoencoder latent sampling and generation
draft: false
---

# VAE 解决了什么问题：从隐变量建模到 ELBO

普通自编码器以重建输入为目标，没有规定隐变量应当服从哪个可采样的分布。因此，直接从标准正态抽取向量交给解码器，并不能保证得到合理样本。

VAE 显式定义隐变量的先验和数据的条件分布，再用编码器近似后验。下面推导 ELBO，说明重建项与 KL 项的来源，以及重参数化怎样让梯度传回编码器。

## 为什么普通自编码器不能直接用于生成

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

这个目标可以用于压缩和表示学习，但只约束训练数据的重建。编码器把输入 $x$ 映射到隐变量 $h$；对于编码分布没有覆盖到的区域，重建损失没有直接提供监督。

训练后可以收集编码向量，却未必知道怎样从它们的分布采样。从标准正态取出的向量，也未必落在解码器训练时见过的区域。要做生成，还需要定义隐变量的采样方式，并让训练与生成时的隐变量分布相匹配。

## 如何把图像生成写成隐变量模型

VAE 使用隐变量模型（latent variable model）描述生成过程。

假设观测 $x$ 由隐变量 $z$ 生成。$z$ 的坐标不一定对应可读的语义特征。生成过程写成：

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

标准正态方便采样，也便于计算后面的 KL 项。这是模型的先验假设，不要求真实图像本身服从高斯分布。

生成时分两步：

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

训练的困难在于这个边缘化积分。

## 为什么后验 $ p(z|x) $ 难以直接计算

如果我们知道一张图像 $x$，最自然的问题是：什么样的隐变量 $z$ 最可能生成它？这对应后验分布：

$$
p_\theta(z|x) = \frac{p_\theta(x|z)p(z)}{p_\theta(x)}
$$

问题卡在分母：

$$
p_\theta(x) = \int p_\theta(x|z)p(z)\,dz
$$

对于常用的神经网络解码器，这个积分通常难以精确计算，因此：

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

后面的 KL 项涉及不同分布，需保留这一区分。

## ELBO 如何把 $ \log p(x) $ 变成可优化目标

为得到 $\log p_\theta(x)$ 的可计算下界，引入满足相应支撑条件的 $q_\phi(z|x)$：

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

KL 非负，所以 ELBO 不超过对数似然。固定生成模型参数 $\theta$ 时，最大化 ELBO 等价于让近似后验接近真实后验；联合训练时，$\theta$ 和 $\phi$ 都参与优化。

## 重参数化技巧如何处理采样不可导

计算重建项需要从 $q_\phi(z|x)$ 采样，还需要估计这个期望对编码器参数的梯度。

假设编码器输出一个高斯分布：

$$
q_\phi(z|x)=\mathcal{N}(z;\mu_\phi(x), \mathrm{diag}(\sigma_\phi^2(x)))
$$

如果你直接写

$$
z \sim \mathcal{N}(\mu_\phi(x), \mathrm{diag}(\sigma_\phi^2(x)))
$$

若将采样当作与参数无关的操作，普通反向传播就无法通过 $z$ 更新 $\mu_\phi(x)$ 和 $\sigma_\phi(x)$。

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

重参数化把随机噪声与可学习参数分开，使重建项可以通过采样值反向传播。它提供了一种路径梯度估计；并非所有分布都能直接使用这里的高斯写法。

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

## KL 项的闭式解如何推导

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

## 重建项优化的是什么

实现中常用 MSE 或 BCE 计算重建损失。选择哪一种，取决于解码器对观测分布的假设。

VAE 的重建项本质上是：

$$
\mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)]
$$

它衡量给定 $z$ 时，模型对观测 $x$ 赋予的条件对数似然。

如果你假设像素值是伯努利分布，那么负对数似然会对应 BCE。

如果假设观测服从固定方差的高斯分布，那么负对数似然在忽略常数和固定比例后对应 MSE。

因此，改动重建损失时也要检查 $p_\theta(x|z)$ 的定义，以及各维度求和或取均值的方式。

## 重建与先验约束的取舍

KL 项约束的是每个输入对应的后验分布 $q_\phi(z|x)$，使它不要偏离先验太远。训练时从近似后验采样，生成时从先验采样，这项约束用于减小二者的差异，但不保证隐变量自动具有可解释语义。

重建项需要 $z$ 保留输入信息，KL 项则限制这种信息的编码方式。两项的相对权重会影响重建和生成效果。如果模型忽略 $z$，就需要检查 posterior collapse；它也与解码器能力和训练过程有关，不能只归因于一个权重。

实现时优化的是负 ELBO：

$$
\mathcal{L}_{VAE}
=
-\mathbb{E}_{q_\phi(z|x)}[\log p_\theta(x|z)]
+
\mathrm{KL}(q_\phi(z|x)\|p(z))
$$

排查训练时，可以分别观察重建项与 KL 项，检查解码器是否使用了 $z$，再比较重建样本和先验生成样本。`beta-VAE` 调整 KL 权重，`IWAE` 改用更紧的似然下界；它们改变的目标不同，需要分开理解。
