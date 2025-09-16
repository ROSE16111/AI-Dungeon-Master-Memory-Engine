# Summarizer CLI （BART+LoRA 长文摘要命令行）

> **一键长文摘要工具**：支持 GPU/CPU 自动检测、LoRA 可选、token 级分块、进度条与可视化。  
> 本 README 覆盖：**全部参数说明**、**调试方法**、**常见报错与修复**、**离线/联网环境配置**。

---

## 0. 功能总览

- **模型加载与输入处理解耦**：`load_summarizer_model()` 仅负责加载（基础模型 + 可选 LoRA）；`read_input_text()` 仅负责读取文本（文件或 `--text`）。  
- **GPU/CPU 自动选择**：`--device auto|cpu|cuda`（默认 `auto`）。自动使用 `torch.cuda.is_available()`，否则回退 CPU。  
- **Token 级分块**：严格按照 tokenizer 进行分块（默认 `1024` + 重叠 `64`），避免超出 BART 编码器上限。  
- **端到端进度可见**：对每个分块的摘要使用 `tqdm` 进度条。  
- **可视化（可选）**：`--visualize` 生成每块 token 数柱状图（PNG）。  
- **LoRA 可开关**：默认加载 `Kishan25/Story_Summarizer`，传 `--no-lora` 仅用基础模型。

---

## 1. 安装与环境

### 1.1 最小依赖
- Python ≥ 3.9
- `torch`（CPU 或 CUDA 版，按你机器选择）  
- `transformers`、`peft`、`tqdm`、`matplotlib`

```bash
# 建议新环境
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

# 安装 PyTorch（请到官网选择与你 CUDA 版本匹配的命令）
# 例如 CPU 版：
pip install torch --index-url https://download.pytorch.org/whl/cpu

# 其他依赖
pip install -r requirements_summarizer_cli.txt
```

> ⚠️ **安装 PyTorch（GPU 版）**：请到 PyTorch 官方“Get Started”页面选择 **OS + Package + CUDA 版本**，复制对应命令安装。GPU 驱动/CUDA 与 PyTorch 需匹配。

### 1.2 文件结构
```
summarizer/
├─ summarizer_cli.py
├─ requirements_summarizer_cli.txt
└─ transcript.txt           # 你的输入（示例）
```

---

## 2. 使用方式（全部参数）

```bash
python summarizer_cli.py [I/O参数] [模型参数] [推理参数] [可视化参数]
```

### 2.1 I/O 参数
| 参数 | 类型 | 默认 | 说明 |
|---|---|---:|---|
| `--input` | str | `None` | 输入文本文件路径（`.txt`）。与 `--text` 二选一。 |
| `--text` | str | `None` | 直接传入的长文本。与 `--input` 二选一。 |
| `--out` | str | 自动推断 | 输出摘要文件路径（未指定则以输入名 `_summary.txt` 结尾）。 |
| `--save-chunk-summaries` | str | `None` | 将每段分块摘要保存到指定文件（可用于审计/复查）。 |

### 2.2 模型参数
| 参数 | 类型 | 默认 | 说明 |
|---|---|---:|---|
| `--base-model` | str | `facebook/bart-large-cnn` | HF 基础模型仓库名或本地路径。 |
| `--lora` | str | `Kishan25/Story_Summarizer` | LoRA 适配器仓库名或本地路径。 |
| `--no-lora` | flag | `False` | 传入该参数则禁用 LoRA，仅用基础模型。 |
| `--device` | `auto|cpu|cuda` | `auto` | 设备选择：自动/CPU/GPU。`auto` 会优先使用可用的 CUDA。 |

### 2.3 推理参数
| 参数 | 类型 | 默认 | 说明 |
|---|---|---:|---|
| `--max-input-tokens` | int | `1024` | 编码器每块最大 token 数（BART 默认 1024 上限）。 |
| `--overlap-tokens` | int | `64` | 分块间重叠 token，用于跨段语义衔接。 |
| `--gen-min-new` | int | `50` | 最少生成的新 token 数。 |
| `--gen-max-new` | int | `150` | 最多生成的新 token 数。 |
| `--beams` | int | `4` | beam search 宽度（增大可提质，但更慢更占显存）。 |

### 2.4 可视化参数
| 参数 | 类型 | 默认 | 说明 |
|---|---|---:|---|
| `--visualize` | flag | `False` | 生成 `*.chunks.png` 柱状图（每块 token 数）。 |

---

## 3. 快速上手

```bash
# 1) 文件摘要（自动选择设备）
python summarizer_cli.py --input transcript.txt --out transcript_summary.txt

# 2) 仅用 CPU，禁用 LoRA
python summarizer_cli.py --input transcript.txt --device cpu --no-lora

# 3) 直接传入文本
python summarizer_cli.py --text "Your long text ..." --out summary.txt

# 4) 保存每块摘要 + 生成可视化
python summarizer_cli.py --input transcript.txt \
  --save-chunk-summaries chunks.txt \
  --visualize
```

运行后，控制台会打印 JSON 摘要，例如：
```json
{
  "device": "cuda",
  "base_model": "facebook/bart-large-cnn",
  "lora_model": "Kishan25/Story_Summarizer",
  "chunks": 8,
  "tokens_per_chunk": [1018, 1019, 1017, 998, 1002, 873, 748, 211],
  "output": "transcript_summary.txt",
  "chunk_summaries": "chunks.txt",
  "visualization": "transcript_summary.chunks.png"
}
```

---

## 4. 设计说明（你可能关心的实现细节）

- **GPU/CPU**：脚本将 **模型与输入张量** 显式 `.to(device)`；GPU 上默认 `float16`，CPU 上默认 `float32`。  
- **生成参数兼容**：优先使用 `max_new_tokens / min_new_tokens`；若旧版 `transformers` 不支持，自动退化为 `max_length / min_length`。  
- **BART 输入长度**：BART 的 `max_position_embeddings = 1024`，因此采用 **token 级分块 + 重叠** 来保持上下文连贯。  
- **LoRA 合并**：加载 PEFT 适配器后可 `merge_and_unload()`，推理时像原生模型一样使用，减少开销与依赖。  
- **可视化**：在无图形界面环境下强制使用 `Agg` 后端生成 PNG。

---

## 5. 调试与常见问题（含修复建议）

> 下列问题在社区/官方文档中均**较为常见**；按模块整理，遇到即可对照排查。

### 5.1 CUDA / GPU 相关

**现象 A**：`torch.cuda.is_available()` 返回 `False`  
- **排查**：
  1) 驱动 & CUDA 工具包版本是否匹配显卡；  
  2) 安装的 **PyTorch** 是否与本机 CUDA 版本匹配（到官网选择器生成命令）；  
  3) 新建干净虚拟环境，避免包冲突。  
- **权宜之计**：加 `--device cpu` 先跑通流程。

**现象 B**：`CUDA out of memory`（推理也可能 OOM）  
- **缓解**：
  - 降低 `--gen-max-new`、`--beams`；  
  - 确保使用 `with torch.no_grad()`（本脚本已启用）；  
  - 关闭其它占 GPU 的进程；  
  - 必要时改用 `--device cpu`。

**现象 C**：GPU 可用但速度很慢  
- **排查**：
  - 确认已实际选择到 `cuda`（看脚本 JSON 输出中的 `"device"` 字段）；  
  - 检查是否使用了 CPU 版 `torch`；  
  - 驱动/CUDA 版本与 `torch` 安装不匹配时也会退化为 CPU。

### 5.2 Transformers / 生成参数

**现象 A**：`generate()` 报“unexpected keyword argument: min_new_tokens / max_new_tokens”  
- **原因**：`transformers` 版本偏旧。  
- **修复**：`pip install -U transformers`。脚本已做兼容回退（使用 `max_length/min_length`）。

**现象 B**：摘要太短或太长  
- 调整：`--gen-min-new` / `--gen-max-new`；`--beams`（更大更稳，但会更慢）。

**现象 C**：输入被截断  
- 调整：`--max-input-tokens` 与 `--overlap-tokens`；  
- 注意：BART 编码器上限通常为 **1024**，不能无限增大；建议通过 **分块** 解决。

### 5.3 Hugging Face 模型下载 / 离线模式

**现象 A**：`OSError: We couldn't connect to 'https://huggingface.co'`  
- **解决**：
  1) **可联网**：重试或配置代理；  
  2) **内网/离线**：预先把模型下载到本地路径，并在 `--base-model/--lora` 里指向本地；  
  3) 启动 **离线模式**：`TRANSFORMERS_OFFLINE=1`（需保证本地已有缓存/文件）。  
  4) 某些地区可设置镜像：`HF_ENDPOINT=https://hf-mirror.com`（视网络环境而定）。

**现象 B**：缓存/路径问题  
- **排查**：检查 `~/.cache/huggingface/hub` 目录或设置 `TRANSFORMERS_CACHE` 到有权限/空间的位置。

### 5.4 Matplotlib 可视化（无显示环境）

**现象**：报错 `Cannot load backend 'TkAgg'` 或无法显示窗口  
- **说明**：服务器/容器通常**无 GUI**。  
- **解决**：使用非交互式后端 `Agg`（脚本内已强制），只输出 PNG 文件。若需交互显示，安装相应 GUI 后端并切换为 `TkAgg/Qt5Agg`。

---

## 6. 最佳实践与优化建议

- **摘要质量**：适度增大 `--beams`，同时控制 `--gen-max-new`，避免过长且跑得太慢。  
- **速度优先**：`--no-lora` + `--gen-max-new` 小一些；或直接 `--device cpu` 在轻量机上跑粗略摘要。  
- **可复现**：固定依赖版本，写入 `requirements_summarizer_cli.txt`。  
- **离线部署**：预下载模型与分词器，配置 `TRANSFORMERS_OFFLINE=1`。

---

## 7. 常用命令速查

```bash
# 查询 CUDA/设备
python - << 'PY'
import torch
print('cuda available:', torch.cuda.is_available())
print('device count  :', torch.cuda.device_count())
if torch.cuda.is_available():
    print('current device:', torch.cuda.current_device())
    print('name          :', torch.cuda.get_device_name(0))
PY

# 仅 CPU 跑一版，验证环境通畅
python summarizer_cli.py --input transcript.txt --device cpu --out cpu_summary.txt

# GPU + LoRA + 可视化
python summarizer_cli.py --input transcript.txt --device cuda \
  --save-chunk-summaries chunks.txt --visualize
```

---

## 8. 版本建议

- `transformers` ≥ 4.18（支持 `max_new_tokens`）；若使用更旧版本，脚本仍可降级兼容。  
- `peft` 建议使用较新版本以获得稳定的 `merge_and_unload()` 行为。  
- `torch` 请严格按 **PyTorch 官方**指引安装与你 CUDA 匹配的版本。

---

## 9. 变更记录

- v1.0：整合 Summary.py / Summary2.py；新增 GPU/CPU 自动检测、token 分块、进度条与可视化；完善 CLI。

---

## 10. 许可证

MIT（可自由使用，保留版权声明）。
