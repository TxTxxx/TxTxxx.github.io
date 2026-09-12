---
title: OpenVLA-OFT 代码解读：动作头、并行解码与多模态输入
date: 2026-04-11
summary: 结合代码解释 OpenVLA-OFT 的几个核心改动，包括连续动作头、并行 action chunk 解码、多图像与 proprio 输入，以及 FiLM 语言调制。
tags:
  - openvla
  - robotics
  - code-reading
  - multimodal
category: embodied-ai
cover_image: /images/openvla-oft-cover.png
cover_alt: OpenVLA-OFT on ALOHA robot showing LLM, vision encoders, FiLM conditioning, parallel decoding, and 25-step action chunks
draft: false
---

# OpenVLA-OFT 代码解读：动作头、并行解码与多模态输入

OpenVLA-OFT 在 OpenVLA 底座上加入连续动作头和并行 action chunk 预测，并支持多视角图像、机器人状态与 FiLM 语言调制。本文沿着这些模块的前向计算，整理训练、推理和 checkpoint 加载之间的对应关系。代码片段省略了部分上下文，用于阅读调用关系，不是可独立运行的脚本。

## 原始 OpenVLA 如何输出动作

OpenVLA 的基础流程比较直接：图像进入视觉编码器，视觉 patch 经过 projector 映射到 LLM 空间，最后由语言模型自回归生成动作 token，再把 token 解码回连续动作。也就是说，动作首先被表示成词表上的离散符号，然后再映射回机器人可以执行的控制量。

```python
# prismatic/models/vlas/openvla.py

@torch.inference_mode()
def predict_action(
    self, image: Image, instruction: str, unnorm_key: Optional[str] = None, **kwargs: str
) -> np.ndarray:
    # 先把语言任务描述包装成 prompt，再交给 tokenizer。
    prompt_builder = self.get_prompt_builder()
    prompt_builder.add_turn(role="human", message=f"What action should the robot take to {instruction.lower()}?")
    prompt_text = prompt_builder.get_prompt()
    input_ids = tokenizer(prompt_text, truncation=True, return_tensors="pt").input_ids.to(self.device)

    # 原始 OpenVLA 直接走 generate()，说明它沿用的是自回归生成接口。
    generated_ids = super(PrismaticVLM, self).generate(
        input_ids=input_ids,
        pixel_values=pixel_values,
        max_new_tokens=self.get_action_dim(unnorm_key),
        **kwargs
    )

    # 这里拿到的还不是连续动作，而是一串 action token ids。
    predicted_action_token_ids = generated_ids[0, -self.get_action_dim(unnorm_key) :]
    normalized_actions = self.action_tokenizer.decode_token_ids_to_actions(
        predicted_action_token_ids.cpu().numpy()
    )

    # 最后再把归一化动作恢复到机器人真实动作范围。
    actions = np.where(
        mask,
        0.5 * (normalized_actions + 1) * (action_high - action_low) + action_low,
        normalized_actions,
    )
    return actions
```

后文以这条“生成 token—解码—反归一化”路径作对照。

## 连续动作头如何从离散 token 扩展到连续回归

OpenVLA-OFT 最直接的变化之一，是动作不再必须由词表 logits 决定，而是可以由一个单独的连续动作头直接读出。仓库里主要提供两种形式：L1 regression 和 diffusion。

```python
# vla-scripts/finetune.py

@dataclass
class FinetuneConfig:
    # OFT 在配置层就暴露了两种连续动作建模分支。
    use_l1_regression: bool = True
    use_diffusion: bool = False

def run_forward_pass(...):
    output: CausalLMOutputWithPast = vla(
        ...,
        output_hidden_states=True,
        ...
    )

    # 和原始离散 token 路线不同，这里显式取最后一层 hidden states。
    last_hidden_states = output.hidden_states[-1]  # (B, seq_len, D)

    # 然后从文本序列里抽出专门用于动作预测的那些位置。
    text_hidden_states = last_hidden_states[:, num_patches:-1]
    actions_hidden_states = (
        text_hidden_states[current_action_mask | next_actions_mask]
        .reshape(batch_size, NUM_ACTIONS_CHUNK * ACTION_DIM, -1)
        .to(torch.bfloat16)
    )

    if use_l1_regression:
        # L1 分支直接从动作位点的 hidden states 回归连续动作。
        predicted_actions = action_head.module.predict_action(actions_hidden_states)
        loss = torch.nn.L1Loss()(ground_truth_actions, predicted_actions)

    if use_diffusion:
        # diffusion 分支则学习条件噪声预测，而不是直接输出最终动作。
        noise_pred = action_head.module.predict_noise(actions_hidden_states)
        loss = nn.functional.mse_loss(noise_pred, noise, reduction="mean")
```

```python
# prismatic/models/action_heads.py

class L1RegressionActionHead(nn.Module):
    def predict_action(self, actions_hidden_states):
        # 先按 action chunk 重排，再交给连续动作头读取。
        rearranged_actions_hidden_states = actions_hidden_states.reshape(batch_size, NUM_ACTIONS_CHUNK, -1)
        action = self.model(rearranged_actions_hidden_states)
        return action

class DiffusionActionHead(nn.Module):
    def predict_noise(self, actions_hidden_states):
        # diffusion 版本复用相同输入，只是输出含义变成噪声估计。
        rearranged_actions_hidden_states = actions_hidden_states.reshape(batch_size, NUM_ACTIONS_CHUNK, -1)
        noise_pred = self.noise_predictor(rearranged_actions_hidden_states)
        return noise_pred
```

两个分支都读取动作位点的 Transformer hidden states。L1 分支预测连续动作，diffusion 分支预测噪声，各自使用对应的训练损失。

## 并行 action chunk 解码如何改变推理接口

OpenVLA-OFT 的另一个核心改动，是把逐 token 生成动作改成并行 action chunk 预测。项目主页把速度提升直接归因于 parallel decoding 和 action chunking，仓库代码也围绕这两个点做了明确适配。

```toml
# pyproject.toml

dependencies = [
    # 仓库依赖一个自定义 transformers fork，原因就是并行解码需要额外支持。
    "transformers @ git+https://github.com/moojink/transformers-openvla-oft.git",  # IMPORTANT: Use this fork for bidirectional attn (for parallel decoding)
]
```

```python
# prismatic/vla/constants.py

LIBERO_CONSTANTS = {
    # LIBERO 默认一次预测 8 个未来动作。
    "NUM_ACTIONS_CHUNK": 8,
    "ACTION_DIM": 7,
}

ALOHA_CONSTANTS = {
    # ALOHA 的 action chunk 更长，对应更高频的控制设定。
    "NUM_ACTIONS_CHUNK": 25,
    "ACTION_DIM": 14,
}
```

```python
# prismatic/extern/hf/modeling_prismatic.py

def _prepare_input_for_action_prediction(self, input_ids, attention_mask):
    # 不再等模型逐个生成动作 token，而是先预留整段动作位点。
    input_ids = torch.cat(
        (
            input_ids,
            torch.ones((input_ids.shape[0], ACTION_DIM * NUM_ACTIONS_CHUNK))
            .to(input_ids.device)
            .to(input_ids.dtype)
            * ACTION_TOKEN_BEGIN_IDX,
        ),
        dim=1,
    )
    return input_ids, attention_mask

def _regression_or_discrete_prediction(...):
    # 一次 forward 后，直接切出整段动作位点对应的 hidden states。
    actions_hidden_states = last_hidden_states[
        :,
        NUM_PATCHES + NUM_PROMPT_TOKENS : NUM_PATCHES + NUM_PROMPT_TOKENS + ACTION_DIM * NUM_ACTIONS_CHUNK,
        :,
    ]

    if action_head is not None:
        # 连续动作头路径：整段 action chunk 一次性读出。
        normalized_actions = action_head.predict_action(actions_hidden_states)
        normalized_actions = normalized_actions.reshape(NUM_ACTIONS_CHUNK, ACTION_DIM)
    else:
        # 离散路径下也不是串行 rollout，而是一次性读取整段动作位点的 logits。
        predicted_action_token_ids = language_model_output.logits[
            :,
            NUM_PATCHES + NUM_PROMPT_TOKENS : NUM_PATCHES + NUM_PROMPT_TOKENS + ACTION_DIM * NUM_ACTIONS_CHUNK,
        ].argmax(dim=2).cpu().numpy()
```

从这部分实现可以看出，OpenVLA-OFT 的做法不是用 past key values 一步一步地推出动作 token，而是先在输入序列里预留整段动作位点，再通过一次 forward 直接读取整个 action chunk 的 hidden states 或 logits。

因此，加载权重时也要使用匹配的序列构造和 attention 实现。只挂载 LoRA adapter 并不能复现这条并行预测路径。

## 多图像与 proprio 输入如何进入模型前向

输入侧可以加入额外相机视角和机器人 proprioceptive state。

```python
# experiments/robot/openvla_utils.py

def get_vla_action(...):
    # 先收集主视角图像。
    all_images = [obs["full_image"]]
    if cfg.num_images_in_input > 1:
        # 如果配置了多图输入，再把 wrist camera 一起加进来。
        all_images.extend([obs[k] for k in obs.keys() if "wrist" in k])

    ...

    if all_images:
        all_wrist_inputs = [
            processor(prompt, image_wrist).to(DEVICE, dtype=torch.bfloat16) for image_wrist in all_images
        ]

        primary_pixel_values = inputs["pixel_values"]
        all_wrist_pixel_values = [wrist_inputs["pixel_values"] for wrist_inputs in all_wrist_inputs]
        # 多张图像不会分多次跑模型，而是直接在输入张量里拼起来。
        inputs["pixel_values"] = torch.cat([primary_pixel_values] + all_wrist_pixel_values, dim=1)

    proprio = None
    if cfg.use_proprio:
        # proprio 也会先按训练时的统计量做归一化。
        proprio = obs["state"]
        proprio_norm_stats = vla.norm_stats[cfg.unnorm_key]["proprio"]
        obs["state"] = normalize_proprio(proprio, proprio_norm_stats)
        proprio = obs["state"]

    # 推理时把 proprio 和 projector 显式送进 predict_action。
    action, _ = vla.predict_action(
        **inputs,
        unnorm_key=cfg.unnorm_key,
        do_sample=False,
        proprio=proprio,
        proprio_projector=proprio_projector,
        ...
    )
```

```python
# prismatic/models/projectors.py

class ProprioProjector(nn.Module):
    def forward(self, proprio: torch.Tensor = None) -> torch.Tensor:
        # 把机器人状态映射到和 LLM hidden size 对齐的特征空间。
        projected_features = self.fc1(proprio)
        projected_features = self.act_fn1(projected_features)
        projected_features = self.fc2(projected_features)
        return projected_features
```

```python
# prismatic/extern/hf/modeling_prismatic.py

def _process_proprio_features(self, projected_patch_embeddings, proprio, proprio_projector):
    if proprio_projector is not None and proprio is not None:
        proprio = proprio.reshape(projected_patch_embeddings.shape[0], -1)
        proprio_features = proprio_projector(proprio)
        proprio_features = proprio_features.unsqueeze(dim=1)
        # 最终 proprio 被当成一个额外 token 拼接进 patch 序列。
        return torch.cat((projected_patch_embeddings, proprio_features), dim=1)
    return projected_patch_embeddings
```

```python
# prismatic/extern/hf/modeling_prismatic.py

class PrismaticVisionBackbone(nn.Module):
    def set_num_images_in_input(self, num_images_in_input: int) -> None:
        self.num_images_in_input = num_images_in_input

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        if self.num_images_in_input == 1:
            ...
        else:
            # 多图输入时，先按每张图对应的通道块拆开。
            images = torch.split(pixel_values, [6] * self.num_images_in_input, dim=1)
            all_patches = []
            for img in images:
                img_regular, img_fused = torch.split(img, [3, 3], dim=1)
                patches = self.featurizer(img_regular)
                patches_fused = self.fused_featurizer(img_fused)
                # 每张图先各自编码，再把 patch 序列拼到一起。
                combined_patches = torch.cat([patches, patches_fused], dim=2)
                all_patches.append(combined_patches)
            return torch.cat(all_patches, dim=1)
```

每张图像分别编码，得到的 patch 序列再拼接。proprio 经过归一化和投影后，作为额外 token 加入序列；训练与推理需要使用一致的图像数量和状态定义。

## FiLM 如何把语言条件注入视觉编码器

ALOHA 设置中的 OpenVLA-OFT+ 启用 FiLM，让语言条件参与视觉特征计算。它修改的是 vision transformer block 的前向过程：

```python
# prismatic/models/film_vit_wrapper.py

class FiLMedVisionTransformerBlock(nn.Module):
    def forward(self, x, average_language_embedding):
        # 语言 embedding 被映射成 FiLM 的缩放和偏移参数。
        gamma = self.scale(average_language_embedding)
        beta = self.shift(average_language_embedding)

        # 先走原始视觉 block 的 attention 路径。
        x = x + self.block.drop_path1(self.block.ls1(self.block.attn(self.block.norm1(x))))
        # 再用语言条件直接调制视觉中间特征。
        x = x * (1 + gamma.view(gamma.shape[0], 1, gamma.shape[1])) + beta.view(beta.shape[0], 1, beta.shape[1])
        x = x + self.block.drop_path2(self.block.ls2(self.block.mlp(self.block.norm2(x))))
        return x
```

```python
# prismatic/models/film_vit_wrapper.py

class FiLMedPrismaticVisionBackbone(nn.Module):
    def forward(self, pixel_values: torch.Tensor, language_embeddings: torch.Tensor) -> torch.Tensor:
        # 先把整段语言 token 压成一个任务级 embedding。
        average_language_embedding = language_embeddings.mean(dim=1)

        if self.get_num_images_in_input() == 1:
            # 然后把这个语言条件送入视觉 backbone。
            return self.vision_backbone.featurizer(pixel_values, average_language_embedding)
```

```python
# prismatic/extern/hf/modeling_prismatic.py

def _process_vision_features(self, pixel_values, language_embeddings=None, use_film=False):
    if use_film:
        # 开启 FiLM 后，视觉主干除了图像还会接收语言 embedding。
        patch_features = self.vision_backbone(pixel_values, language_embeddings)
    else:
        patch_features = self.vision_backbone(pixel_values)

    return self.projector(patch_features)
```

```python
# vla-scripts/finetune.py

if cfg.use_film:
    # 训练阶段直接把原始视觉主干包成 FiLM 版本。
    vla.model.vision_backbone = FiLMedPrismaticVisionBackbone(
        vision_backbone=vla.model.vision_backbone,
        llm_dim=vla.llm_dim,
    )
```

语言 token 的 embedding 先取均值，再生成缩放和偏移参数，作用于视觉 block 的中间特征。启用 FiLM 后，视觉编码便依赖当前语言输入。

## 可选模块怎样保存和恢复

动作头、FiLM 和 proprio 都有独立配置。保存与加载必须匹配这些开关：

```python
# vla-scripts/finetune.py

@dataclass
class FinetuneConfig:
    # 这些开关分别控制动作头、FiLM、多图输入、proprio 和 LoRA。
    use_l1_regression: bool = True
    use_diffusion: bool = False
    use_film: bool = False
    num_images_in_input: int = 1
    use_proprio: bool = False
    use_lora: bool = True
```

```python
# vla-scripts/finetune.py

def save_training_checkpoint(...):
    # 基础 processor 和 VLA adapter 仍然是 checkpoint 的一部分。
    processor.save_pretrained(checkpoint_dir)
    vla.module.save_pretrained(adapter_dir)

    if cfg.use_proprio and proprio_projector is not None:
        # proprio projector 单独保存，说明它不是底座自带参数。
        torch.save(proprio_projector.state_dict(), checkpoint_dir / f"proprio_projector--{checkpoint_name_suffix}")

    if cfg.use_diffusion and noisy_action_projector is not None:
        # diffusion 分支还会额外保存噪声相关模块。
        torch.save(
            noisy_action_projector.state_dict(), checkpoint_dir / f"noisy_action_projector--{checkpoint_name_suffix}"
        )

    if (cfg.use_l1_regression or cfg.use_diffusion) and action_head is not None:
        # 连续动作头也是独立持久化的模块。
        torch.save(action_head.state_dict(), checkpoint_dir / f"action_head--{checkpoint_name_suffix}")

    if cfg.use_film:
        # FiLM 打开时，视觉主干的参数也要单独保存。
        torch.save(
            vla.module.vision_backbone.state_dict(), checkpoint_dir / f"vision_backbone--{checkpoint_name_suffix}"
        )
```

```python
# experiments/robot/openvla_utils.py

def get_vla(cfg: Any) -> torch.nn.Module:
    vla = AutoModelForVision2Seq.from_pretrained(...)

    if cfg.use_film:
        # 推理加载时会按配置把 FiLM 包装重新挂回模型。
        vla = _apply_film_to_vla(vla, cfg)

    # 多图输入能力和数据集统计量都在加载阶段恢复。
    vla.vision_backbone.set_num_images_in_input(cfg.num_images_in_input)
    _load_dataset_stats(vla, cfg.pretrained_checkpoint)
    return vla

def get_proprio_projector(cfg: Any, llm_dim: int, proprio_dim: int) -> ProprioProjector:
    # proprio projector 作为独立模块按需加载。
    ...

def get_action_head(cfg: Any, llm_dim: int) -> Union[L1RegressionActionHead, DiffusionActionHead]:
    # 动作头同样根据配置单独恢复。
    ...
```

除 adapter 外，checkpoint 还可能包含动作头、proprio projector 和 FiLM 视觉主干参数。加载时需要恢复相应模块，并设置图像数量和数据集统计量。

## 这些结构改动带来了什么结果

以下数字来自项目页和文档，对应项目的评估设置，不是本文重新测得的结果。

项目主页把速度提升直接归因于 parallel decoding 和 action chunking，并报告在 LIBERO 上实现了 26x faster action generation speed 和 3x lower latency；首页 TL;DR 给出的总口径是 25-50x inference speedup。这和代码里预留整段动作位点、一次性读取 action chunk 的实现是一致的。

`LIBERO.md` 中给出的结果显示，针对四个任务套件分别训练的 OpenVLA-OFT policy 平均成功率为 97.1%，把四个套件合并成单一 policy 后平均成功率仍有 96.8%。连续动作头、多图像输入和 proprio 支持，都是围绕这类下游任务表现做出的结构改动。

OFT+ 在 ALOHA 上启用了 FiLM，把 `NUM_ACTIONS_CHUNK` 提高到 25，并支持 3 张输入图像和 proprio。这些能力在 `prismatic/vla/constants.py`、`film_vit_wrapper.py` 和 `openvla_utils.py` 中都有对应实现。

与此同时，工程复杂度也明显增加：

- 它依赖自定义 `transformers` fork 来支持并行解码。
- 它的 checkpoint 由多个模块组成，加载时需要匹配相应配置。
- 它对平台和任务设定有更强绑定，例如 LIBERO 和 ALOHA 的 `NUM_ACTIONS_CHUNK`、`ACTION_DIM`、`PROPRIO_DIM` 并不相同。

这些结果不能只凭单个模块的代码归因。比较自己的配置时，还要固定任务、硬件、chunk 长度和输入模态。

## 加载模型前核对配置

`vla-scripts/finetune.py` 决定训练时启用哪些模块；`prismatic/extern/hf/modeling_prismatic.py` 负责并行动作位点和多模态输入；FiLM 的实现位于 `prismatic/models/film_vit_wrapper.py`。排查加载或输出维度问题时，可以按这个对应关系检查训练配置、保存的模块文件和推理参数是否一致。

## References

- OpenVLA-OFT project page: <https://openvla-oft.github.io/>
- OpenVLA-OFT paper: <https://arxiv.org/abs/2502.19645>
- OpenVLA-OFT code: <https://github.com/moojink/openvla-oft>
- OpenVLA project page: <https://openvla.github.io/>
- OpenVLA paper: <https://arxiv.org/abs/2406.09246>
- OpenVLA code: <https://github.com/openvla/openvla>
