---
title: DDPM 数学主线：前向扩散、逆向后验与噪声预测
date: 2026-04-12
summary: 推导前向加噪的闭式采样、给定原图的逆向后验，以及噪声预测损失与采样更新式。
tags:
  - ddpm
  - diffusion-models
  - generative-models

cover_image: /images/ddpm-cover.png
cover_alt: Diagram illustrating DDPM forward diffusion and reverse denoising process
draft: false
---

# DDPM 数学主线：前向扩散、逆向后验与噪声预测

DDPM 定义一个固定的高斯加噪过程，再学习逐步去噪的生成过程。前向过程可以直接采样任意时刻的带噪图像；给定原图时，逆向一步的后验也有闭式解。这两点使噪声预测网络能够获得训练监督。

下面沿着前向分布、后验均值和训练损失推导，最后写出采样更新式。

## 为什么 DDPM 要先构造前向扩散过程

目标是从数据分布 $q(x_0)$ 生成新样本。DDPM 先对真实样本逐步加入高斯噪声，让终点分布接近标准正态，再训练逆向过程，从噪声恢复数据。前向转移由噪声调度确定，不需要网络学习。

于是问题被拆成两个过程：

- 正向扩散过程（forward diffusion）：$x_0 \to x_1 \to \cdots \to x_T$
- 逆向生成过程（reverse process）：$x_T \to x_{T-1} \to \cdots \to x_0$

训练需要使用前向过程构造带噪输入，生成时则依次执行学到的逆向转移。

## 前向扩散如何写成马尔可夫链

DDPM 把前向过程定义成一个长度为 $T$ 的马尔可夫链：

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

$\beta_t\in(0,1)$ 控制每一步的噪声方差。转移在加入噪声的同时，用 $\sqrt{\alpha_t}$ 衰减原信号。条件高斯的形式便于合并多步转移，也便于后面计算后验。

## 为什么前向扩散存在闭式解

训练需要不同噪声水平下的 $x_t$。利用独立高斯噪声的线性组合，可以直接从 $x_0$ 采样 $x_t$，省去中间的 $t-1$ 次转移。

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

训练时可以为批次中的样本分别抽取 $t$，再用这个公式构造输入。终点接近标准正态则需要足够小的 $\bar{\alpha}_T$：

$$
q(x_T|x_0)\approx \mathcal{N}(0,I)
$$

当 $\bar{\alpha}_T \to 0$ 时，

$$
\sqrt{\bar{\alpha}_T}x_0 \to 0,\quad 1-\bar{\alpha}_T \to 1
$$

此时均值中的数据信号趋近于零，协方差趋近于 $I$。有限步数下通常是近似，而非严格相等。

## 逆向生成过程需要学习什么分布

如果前向过程是固定的，那生成时我们真正需要的是逆向过程：

$$
p_\theta(x_{0:T})=p(x_T)\prod_{t=1}^T p_\theta(x_{t-1}|x_t)
$$

其中通常设

$$
p(x_T)=\mathcal{N}(0,I)
$$

前向转移 $q(x_t|x_{t-1})$ 已知，但它不能直接反解为 $q(x_{t-1}|x_t)$。后者还依赖前一时刻的分布。

直接求

$$
q(x_{t-1}|x_t)
$$

很难，因为它依赖未知的数据分布 $q(x_0)$。训练时额外知道原图，可以计算后验

$$
q(x_{t-1}|x_t,x_0)
$$

对于 $t>1$，它是均值和方差都有闭式解的高斯分布。

## 为什么 $ q(x_{t-1}|x_t,x_0) $ 仍然是高斯分布

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

后验均值是 $x_t$ 和 $x_0$ 的线性组合，系数由噪声调度确定。生成时没有 $x_0$，后面会用网络预测替代它。

推导如果展开，本质上就是把两个高斯的指数项写出来，对 $x_{t-1}$ 的二次项和一次项配方。写到最后会得到标准高斯形式：

$$
\log q(x_{t-1}|x_t,x_0)
=
-\frac{1}{2\tilde{\beta}_t}\|x_{t-1}-\tilde{\mu}_t(x_t,x_0)\|^2 + C
$$

其中 $C$ 是与 $x_{t-1}$ 无关的常数。

注意这里条件中包含 $x_0$；去掉这个条件，不能直接沿用同一个高斯后验。

## 生成时没有 $ x_0 $ 该怎么办

上面这个后验很好，可惜生成时用不了。因为在采样阶段你只有 $x_t$，没有真实的 $x_0$。于是 DDPM 做了一个自然的近似：训练一个网络去拟合逆向过程

$$
p_\theta(x_{t-1}|x_t)=\mathcal{N}(x_{t-1};\mu_\theta(x_t,t),\Sigma_\theta(x_t,t))
$$

原始 DDPM 通常把方差固定为某个预设值，比如 $\tilde{\beta}_t I$ 或 $\beta_t I$，重点学习均值：

$$
\mu_\theta(x_t,t)
$$

那网络到底应该直接预测什么？你有几种等价参数化：

- 直接预测 $x_0$
- 直接预测后验均值 $\tilde{\mu}_t$
- 预测噪声 $\epsilon$

下面采用噪声预测参数化。训练时加入的噪声已知，可以直接作为回归标签。

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

这样，网络输入 $(x_t,t)$、输出噪声估计，逆向均值由上述公式计算。

## 训练目标为什么可以化成噪声预测 MSE

DDPM 的变分目标可写为以下负对数似然上界：

$$
\mathbb{E}_{q}\Big[
D_{KL}(q(x_T|x_0)\|p(x_T))
+
\sum_{t=2}^T D_{KL}\big(q(x_{t-1}|x_t,x_0)\|p_\theta(x_{t-1}|x_t)\big)
-\log p_\theta(x_0|x_1)
\Big]
$$

中间的 KL 项比较可计算的后验与模型逆向转移，最后一项负责从 $x_1$ 重建 $x_0$。

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

训练步骤为：

1. 从数据中采样一张干净图像 $x_0$
2. 随机采样一个时间步 $t$
3. 采样高斯噪声 $\epsilon$
4. 用闭式解构造 $x_t$
5. 让网络根据 $(x_t,t)$ 去预测 $\epsilon$
6. 用 MSE 训练

这里的 $\mathcal{L}_{simple}$ 去掉了变分目标中随时间步变化的权重，因此不能把它与原始 ELBO 完全等同。

## DDPM 采样时每一步在做什么

训练完成后，采样从纯噪声开始：

$$
x_T\sim\mathcal{N}(0,I)
$$

然后对 $t=T,T-1,\dots,1$ 依次执行：

$$
x_{t-1}=\mu_\theta(x_t,t)+\sigma_t z,\quad z\sim\mathcal{N}(0,I)
$$

其中当 $t>1$ 时加噪声，当 $t=1$ 时通常不再加噪。代入前面的均值参数化，就是：

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

噪声预测先转换为逆向均值，再按设定的方差采样下一状态。$\sigma_t z$ 对应这个转移的随机项；即使不加逐步噪声，随机初值也仍可产生不同样本。

## 采样步数与计算代价

前向闭式解让训练可以直接抽取任意时间步，但标准 DDPM 的生成仍需顺序执行逆向转移。每一步调用一次网络，长采样链因而带来较高推理成本。

减少步数需要相应的采样更新，不能直接跳过原链中的转移。DDIM 和 DPM-Solver 等方法处理的就是这类问题。比较加速效果时，还要检查噪声调度、方差设定和生成质量；单看训练 MSE，无法判断一个少步采样方案是否有效。
