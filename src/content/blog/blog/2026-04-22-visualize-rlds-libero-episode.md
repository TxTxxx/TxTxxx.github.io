---
title: 我是怎么可视化 RLDS 版 LIBERO 数据集的
date: 2026-04-22
summary: 分享一个直接从 TFDS 读取 RLDS episode、导出 JSON 摘要和逐步图像的小脚本，用来快速检查 LIBERO 数据集每条轨迹到底存了什么。
tags:
  - rlds
  - tfds
  - libero
  - robotics
cover_image: /images/rlds-episode-inspection-cover.png
cover_alt: Terminal-style diagram showing an RLDS episode with episode metadata, steps, and exported step images
draft: false
---

# 我是怎么可视化 RLDS 版 LIBERO 数据集的

最近在看 RLDS 版的 LIBERO 数据集时，我最想确认的不是训练 batch 长什么样，而是一条原始 episode 里到底有什么：任务指令、动作、状态、主视角图像、腕部图像分别怎么存，终止标记放在哪一层。

直接看训练代码不太适合回答这个问题。我最后用了一个更直接的办法：从 TFDS 里取一条原始 episode，把内部的 `steps` 展开，然后同时导出终端结构、JSON 摘要和逐步 PNG。这样一条轨迹发生了什么，基本就能直接看清。

## 先确认 RLDS 数据在磁盘上怎么放

我这里的数据目录是：

```text
/Users/txtxx/code/model/openvla/modified_libero_rlds/
└── libero_spatial_no_noops/
    └── 1.0.0/
        ├── dataset_info.json
        ├── features.json
        ├── libero_spatial-train.tfrecord-00000-of-00016
        ├── libero_spatial-train.tfrecord-00001-of-00016
        └── ...
```

这个结构里最值得先看的有三类文件：

- `dataset_info.json`：数据集名、版本、split 和分片信息。
- `features.json`：episode 和 step 的字段 schema。
- `*.tfrecord-*`：真正的数据内容。

比如 `dataset_info.json` 里能直接看到这份数据只有 `train` split：

```json
{
  "fileFormat": "tfrecord",
  "name": "libero_spatial",
  "splits": [
    {
      "name": "train",
      "numBytes": "1914619638"
    }
  ],
  "version": "1.0.0"
}
```

所以后面读取时，最少要先把 `dataset_name` 和 `split` 对上。

## 读取一条 episode 的代码其实很短

我最后用的读取方式就是直接走 TFDS：

```python
from pathlib import Path

import tensorflow_datasets as tfds


data_dir = Path("/Users/txtxx/code/model/openvla/modified_libero_rlds")
dataset_name = "libero_spatial_no_noops"

builder = tfds.builder(dataset_name, data_dir=str(data_dir))
dataset = builder.as_dataset(split="train")

iterator = dataset.skip(0).take(1)
episode = next(iter(tfds.as_numpy(iterator)))
episode = materialize_rlds(episode)
```

这里有一个点一开始容易忽略：`episode` 顶层拿到了，不代表内部已经完全变成普通 Python 结构。`steps` 这一层常常还是 TFDS 的惰性对象，不先展开的话，后面既不方便打印，也不方便导出。

我这里用的是这个递归函数：

```python
from typing import Any


def materialize_rlds(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: materialize_rlds(v) for k, v in value.items()}

    if hasattr(value, "__iter__") and type(value).__name__ == "_IterableDataset":
        return [materialize_rlds(v) for v in value]

    if isinstance(value, list):
        return [materialize_rlds(v) for v in value]

    return value
```

我踩过的一个坑是，对内部的 `_IterableDataset` 再调用一次 `tfds.as_numpy(...)`。这会直接报：

```text
TypeError: Arguments to as_numpy must be tf.Tensors or tf.data.Datasets.
```

原因很简单：外层 episode 已经转成 NumPy 了，里面这个 `steps` 只是个还能继续遍历的包装对象，不是新的 `tf.data.Dataset`。

## 我最后保留了三种输出

只在终端里打印整条 episode 不太够，因为图像数组和状态向量都比较大。我最后保留了三种输出：

- 终端树形结构：适合先看字段层级。
- JSON 摘要：适合保留结构化结果。
- 逐步 PNG：适合直接看轨迹过程。

完整脚本在这里：[inspect_raw_rlds_episode.py](/Users/txtxx/code/python/steerable-policies-bridge/scripts/inspect_raw_rlds_episode.py)。

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
import tensorflow_datasets as tfds


def materialize_rlds(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: materialize_rlds(v) for k, v in value.items()}
    if hasattr(value, "__iter__") and type(value).__name__ == "_IterableDataset":
        return [materialize_rlds(v) for v in value]
    if isinstance(value, list):
        return [materialize_rlds(v) for v in value]
    return value


def decode_scalar(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, np.generic):
        return value.item()
    return value


def preview_value(value: Any) -> str:
    if isinstance(value, bytes):
        return repr(value.decode("utf-8", errors="replace"))
    if isinstance(value, np.ndarray):
        if value.ndim == 0:
            return repr(decode_scalar(value[()]))
        if value.dtype.kind in {"i", "u", "f"} and value.size > 0:
            flat = value.reshape(-1)
            count = min(8, flat.shape[0])
            return f"first_values={flat[:count].tolist()}"
        return ""
    return repr(value)


def print_tree(value: Any, prefix: str = "") -> None:
    if isinstance(value, dict):
        print(f"{prefix}dict(keys={list(value.keys())})")
        for key, child in value.items():
            print(f"{prefix}{key}:")
            print_tree(child, prefix + "  ")
        return

    if isinstance(value, list):
        print(f"{prefix}list(len={len(value)})")
        for idx, child in enumerate(value):
            print(f"{prefix}[{idx}]:")
            print_tree(child, prefix + "  ")
        return

    if isinstance(value, np.ndarray):
        extra = preview_value(value)
        suffix = f", {extra}" if extra else ""
        print(f"{prefix}ndarray(shape={value.shape}, dtype={value.dtype}{suffix})")
        return

    print(f"{prefix}{type(value).__name__}: {decode_scalar(value)!r}")


def to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        if value.size <= 32 and value.dtype.kind not in {"S", "O"}:
            return value.tolist()
        return {"shape": list(value.shape), "dtype": str(value.dtype)}
    return value


def export_step_images(episode: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for step_idx, step in enumerate(episode["steps"]):
        obs = step.get("observation", {})
        for key, value in obs.items():
            if not isinstance(value, np.ndarray):
                continue
            if value.ndim != 3:
                continue
            if value.shape[-1] not in {1, 3, 4}:
                continue
            if value.dtype != np.uint8:
                value = np.clip(value, 0, 255).astype(np.uint8)
            Image.fromarray(value).save(output_dir / f"step_{step_idx:04d}_{key}.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--dataset-name", type=str, required=True)
    parser.add_argument("--split", type=str, default="train")
    parser.add_argument("--episode-index", type=int, default=0)
    parser.add_argument("--output-dir", type=Path, default=None)
    args = parser.parse_args()

    builder = tfds.builder(args.dataset_name, data_dir=str(args.data_dir))
    dataset = builder.as_dataset(split=args.split)
    iterator = dataset.skip(args.episode_index).take(1)
    episode = next(iter(tfds.as_numpy(iterator)))
    episode = materialize_rlds(episode)

    print_tree(episode)

    if args.output_dir is not None:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        with open(args.output_dir / "episode_summary.json", "w", encoding="utf-8") as f:
            json.dump(to_jsonable(episode), f, ensure_ascii=False, indent=2)
        export_step_images(episode, args.output_dir / "images")


if __name__ == "__main__":
    main()
```

## 跑完之后能看到什么

我实际运行的命令是：

```bash
conda run -n keyan python scripts/inspect_raw_rlds_episode.py \
  --data-dir /Users/txtxx/code/model/openvla/modified_libero_rlds \
  --dataset-name libero_spatial_no_noops \
  --split train \
  --episode-index 0 \
  --output-dir /tmp/libero_spatial_ep0
```

跑完之后会得到三类结果：

- 终端里的完整 episode 结构。
- `/tmp/libero_spatial_ep0/episode_summary.json`
- `/tmp/libero_spatial_ep0/images/`

比如第 0 个 step 的结构大概是这样：

```text
[0]:
  dict(keys=['action', 'discount', 'is_first', 'is_last', 'is_terminal', 'language_instruction', 'observation', 'reward'])
  action:
    ndarray(shape=(7,), dtype=float32, first_values=[0.13124999403953552, -0.0401785708963871, -0.0, 0.0, -0.04928571358323097, -0.0, -1.0])
  language_instruction:
    bytes: 'pick up the black bowl next to the cookie box and place it on the plate'
  observation:
    dict(keys=['image', 'joint_state', 'state', 'wrist_image'])
```

这已经足够回答几个很实际的问题：

- 一条 episode 顶层是不是 `episode_metadata + steps`
- `action` 的维度是多少
- 图像字段叫什么，shape 是多少
- 任务语言是 bytes 还是字符串
- 最后一步的 `is_last`、`is_terminal` 和 `reward` 有没有变化

而导出的 PNG 序列更直观，因为你可以直接按文件名排序看整条轨迹过程：

```text
/tmp/libero_spatial_ep0/images/step_0004_image.png
/tmp/libero_spatial_ep0/images/step_0005_wrist_image.png
/tmp/libero_spatial_ep0/images/step_0010_image.png
...
```

## 这类小脚本什么时候有用

我觉得这种脚本最适合两个场景。

第一种是刚接手一个 RLDS 数据集的时候。你还没开始训练，但想先确认这份数据里到底有什么，字段层级对不对，图像和动作是不是按你预期存的。

第二种是训练结果不对的时候。比起一上来就读 dataloader 和训练主循环，先把一条原始 episode 展开看看，通常更快定位问题到底出在原始数据，还是出在后面的变换逻辑。

如果下一步还要继续查，我一般会再看两处：`features.json` 里的 schema，和训练代码里的 batch transform。前者回答“理论上应该长什么样”，后者回答“训练前又被改成了什么样”。

