---
title: 损失函数从哪里来：最大似然、KL 散度与交叉熵
date: 2026-05-12
summary: 从最大似然和 KL 散度出发，解释 MSE、二元交叉熵和多类交叉熵为什么不是随意定义的，而是由输出变量的概率分布假设推导出来的。
tags:
  - deep-learning
  - loss-functions
  - maximum-likelihood
  - cross-entropy
cover_image: /images/loss-function-landscape-difference.png
cover_alt: Loss function landscape and comparison between two loss curves near the optimum
draft: false
---

# 损失函数从哪里来：最大似然、KL 散度与交叉熵

损失函数不是训练时随便选一个“误差打分规则”。如果先假设输出变量服从某个条件概率分布，再用最大似然估计模型参数，常见的 MSE、二元交叉熵和多类交叉熵都能被推导出来。

我以前更容易把 loss 理解成工程里人为定义的目标：回归用平方误差，分类用交叉熵，只要能优化就行。读到最大似然这条线后，更准确的理解是：loss 的形式来自输出变量的建模假设，训练是在让真实标签在模型预测的分布下有更高概率。

![Loss function landscape and comparison between two loss curves near the optimum](/images/loss-function-landscape-difference.png)

## 最大似然把训练目标写成负对数概率

给定训练集：

$$
\mathcal{D} = \{(x_i, y_i)\}_{i=1}^{N}
$$

模型原来可以被理解成直接预测一个值：

$$
\hat{y}_i = f(x_i; \omega)
$$

最大似然的视角会先改写这个问题：模型不直接给出最终答案，而是预测一个条件分布的参数。也就是先选择一个适合输出空间的概率分布：

$$
p(y \mid \theta)
$$

再让神经网络根据输入计算分布参数：

$$
\theta_i = f(x_i; \omega)
$$

于是每个样本的真实标签 $y_i$ 都会在模型给出的分布下得到一个概率或概率密度：

$$
p(y_i \mid f(x_i; \omega))
$$

如果假设训练样本独立同分布，整个训练集的似然是所有样本概率的乘积：

$$
\prod_{i=1}^{N} p(y_i \mid f(x_i; \omega))
$$

训练目标是找到让这个乘积最大的参数：

$$
\hat{\omega}
= \arg\max_{\omega}
\prod_{i=1}^{N} p(y_i \mid f(x_i; \omega))
$$

实际优化时不会直接最大化一串很小概率的乘积，而是取对数。因为 $\log$ 是单调递增函数，最大值位置不变：

$$
\hat{\omega}
= \arg\max_{\omega}
\sum_{i=1}^{N}
\log p(y_i \mid f(x_i; \omega))
$$

深度学习训练通常写成最小化问题，所以再乘上负号，得到负对数似然：

$$
\mathcal{L}(\omega)
=
-\sum_{i=1}^{N}
\log p(y_i \mid f(x_i; \omega))
$$

这一步很关键。loss 的来源不是“预测值和标签差多少”这个直觉，而是“真实标签在模型分布下有多不可能”。当真实标签概率越高，负对数概率越小，loss 越低。

## 高斯回归的固定方差假设会得到 MSE

先看单变量回归。输出 $y$ 是连续实数，常见假设是：在给定输入 $x_i$ 后，真实输出来自一个高斯分布。模型预测均值，方差先设成固定常数：

$$
y_i \sim \mathcal{N}(\mu_i, \sigma^2),
\quad
\mu_i = f(x_i; \omega)
$$

对应的概率密度是：

$$
p(y_i \mid x_i; \omega)
=
\frac{1}{\sqrt{2\pi\sigma^2}}
\exp
\left(
-\frac{(y_i - f(x_i; \omega))^2}{2\sigma^2}
\right)
$$

代入负对数似然：

$$
\mathcal{L}(\omega)
=
-\sum_{i=1}^{N}
\log p(y_i \mid x_i; \omega)
$$

展开后得到：

$$
\mathcal{L}(\omega)
=
\sum_{i=1}^{N}
\left[
\frac{(y_i - f(x_i; \omega))^2}{2\sigma^2}
+
\frac{1}{2}\log(2\pi\sigma^2)
\right]
$$

如果 $\sigma^2$ 是固定常数，第二项不依赖 $\omega$，第一项里的 $1/(2\sigma^2)$ 也只是常数缩放，不改变最优参数位置。因此优化目标可以化简成：

$$
\mathcal{L}_{\mathrm{MSE}}(\omega)
=
\sum_{i=1}^{N}
(y_i - f(x_i; \omega))^2
$$

这就是最小平方损失。它隐含的建模假设是：回归残差服从均值为 0、方差固定的高斯噪声。

如果不同输入对应的不确定性不同，就不能只用固定方差。模型可以同时预测均值和方差：

$$
\mu_i = f_{\mu}(x_i; \omega),
\quad
\sigma_i^2 = f_{\sigma}(x_i; \omega)^2
$$

这时负对数似然保留了两部分：

$$
\mathcal{L}(\omega)
=
\sum_{i=1}^{N}
\left[
\frac{(y_i - \mu_i)^2}{2\sigma_i^2}
+
\frac{1}{2}\log\sigma_i^2
\right]
+
C
$$

第一项让残差小，第二项限制模型不能随意把方差预测得很大。这个形式比普通 MSE 多表达了一个信息：模型不仅给出点估计，也给出输入相关的不确定性估计。

## 伯努利分布把二分类推到 BCE

二分类的标签只有两个取值：

$$
y_i \in \{0, 1\}
$$

适合这个输出空间的分布是伯努利分布。它只有一个参数 $\lambda_i$，表示标签为 1 的概率：

$$
\lambda_i = p(y_i = 1 \mid x_i)
$$

神经网络通常先输出一个不受范围限制的 logit $z_i$，再经过 sigmoid 得到概率：

$$
\lambda_i = \sigma(z_i)
=
\frac{1}{1+\exp(-z_i)}
$$

伯努利分布可以写成：

$$
p(y_i \mid x_i)
=
\lambda_i^{y_i}
(1-\lambda_i)^{1-y_i}
$$

代入负对数似然：

$$
\mathcal{L}(\omega)
=
-\sum_{i=1}^{N}
\log
\left[
\lambda_i^{y_i}
(1-\lambda_i)^{1-y_i}
\right]
$$

利用对数规则展开：

$$
\mathcal{L}_{\mathrm{BCE}}(\omega)
=
-\sum_{i=1}^{N}
\left[
y_i\log\lambda_i
+
(1-y_i)\log(1-\lambda_i)
\right]
$$

这就是 binary cross entropy。它不是单独设计出来惩罚分类错误的公式，而是伯努利分布负对数似然的结果。

工程实现里通常直接用 logits 版本，例如 PyTorch 的 `BCEWithLogitsLoss`。原因不是数学目标变了，而是把 sigmoid 和 BCE 合在一起计算可以减少数值不稳定，尤其是 logit 很大或很小时。

## 分类分布和 softmax 给出多类交叉熵

多分类标签属于 $K$ 个类别之一：

$$
y_i \in \{1, 2, \ldots, K\}
$$

这时输出分布应该是分类分布。模型需要为每个类别预测一个概率：

$$
\lambda_{i1}, \lambda_{i2}, \ldots, \lambda_{iK}
$$

这些概率必须非负且总和为 1。神经网络先输出 $K$ 个 logits：

$$
z_i = [z_{i1}, z_{i2}, \ldots, z_{iK}]
$$

再用 softmax 转成概率：

$$
\lambda_{ik}
=
\frac{\exp(z_{ik})}
{\sum_{j=1}^{K}\exp(z_{ij})}
$$

如果真实类别是 $y_i$，分类分布给这个标签的概率就是：

$$
p(y_i \mid x_i)
=
\lambda_{i,y_i}
$$

负对数似然变成：

$$
\mathcal{L}(\omega)
=
-\sum_{i=1}^{N}
\log \lambda_{i,y_i}
$$

用 one-hot 标签 $q_i(k)$ 写，就是：

$$
\mathcal{L}_{\mathrm{CE}}(\omega)
=
-\sum_{i=1}^{N}
\sum_{k=1}^{K}
q_i(k)\log \lambda_{ik}
$$

这就是多类交叉熵。因为 one-hot 标签只有真实类别位置为 1，所以它最终只取真实类别的预测概率：

$$
-\log \lambda_{i,y_i}
$$

PyTorch 的 `CrossEntropyLoss` 默认接收 logits，而不是 softmax 之后的概率。它内部会做 `log_softmax` 和负对数似然，所以训练代码里通常不要先手动 softmax。

## KL 散度到交叉熵只丢掉了固定项

交叉熵还可以从 KL 散度推出来。这个角度回答的是另一个问题：如果我们希望模型分布接近真实数据分布，为什么会得到交叉熵？

设真实或经验标签分布为 $q(y)$，模型预测分布为 $p_{\omega}(y \mid x)$。KL 散度衡量的是从 $q$ 到 $p_{\omega}$ 的分布差异：

$$
D_{\mathrm{KL}}(q \parallel p_{\omega})
=
\sum_y
q(y)
\log
\frac{q(y)}{p_{\omega}(y \mid x)}
$$

展开：

$$
D_{\mathrm{KL}}(q \parallel p_{\omega})
=
\sum_y q(y)\log q(y)
-
\sum_y q(y)\log p_{\omega}(y \mid x)
$$

第一项只由数据分布 $q$ 决定，不依赖模型参数 $\omega$。训练时优化的是 $\omega$，所以这一项对最优参数位置没有影响。剩下需要最小化的是：

$$
-
\sum_y
q(y)
\log p_{\omega}(y \mid x)
$$

这正是交叉熵：

$$
H(q, p_{\omega})
=
-
\sum_y
q(y)
\log p_{\omega}(y \mid x)
$$

因此：

$$
\arg\min_{\omega}
D_{\mathrm{KL}}(q \parallel p_{\omega})
=
\arg\min_{\omega}
H(q, p_{\omega})
$$

对于普通分类任务，$q$ 通常是 one-hot 经验分布，真实类别概率为 1，其他类别为 0。此时交叉熵退化成真实类别预测概率的负对数：

$$
H(q, p_{\omega})
=
-\log p_{\omega}(y_{\mathrm{true}} \mid x)
$$

这和最大似然推导出来的多类交叉熵完全一致。最大似然从“让观测标签概率最大”出发，KL 散度从“让模型分布接近经验分布”出发，最后得到同一个优化目标。

## 选择 loss 前先确认输出变量和分布假设

常见 loss 可以按这条线整理：

| 任务 | 输出变量 | 分布假设 | 模型输出 | 推导出的 loss |
| --- | --- | --- | --- | --- |
| 单变量回归 | $y \in \mathbb{R}$ | 高斯分布，方差固定 | 均值 $\mu$ | MSE |
| 二元分类 | $y \in \{0, 1\}$ | 伯努利分布 | logit，经 sigmoid 得到概率 | BCE |
| 多类分类 | $y \in \{1, \ldots, K\}$ | 分类分布 | logits，经 softmax 得到概率 | Cross entropy |
| 异方差回归 | $y \in \mathbb{R}$ | 高斯分布，方差随输入变化 | 均值和方差 | Gaussian NLL |

所以选择 loss 时应该先问三个问题：

- 输出变量是什么类型：连续值、二分类标签、多分类标签，还是多个输出的组合。
- 模型应该预测什么分布参数：均值、概率、logits、方差，还是它们的组合。
- 训练目标是否匹配数据噪声：固定方差、高斯噪声、类别不平衡、标签不确定性都会影响 loss 的选择。

这也是我这次最需要修正的理解。损失函数可以手工设计，但常用 loss 不是只靠经验凑出来的公式。它们背后通常有明确的概率假设：先定义输出分布，再写似然，最后得到可以优化的负对数似然。

如果这个假设和任务不匹配，训练仍然能跑，但 loss 的数值不再准确表达我们真正想优化的目标。
