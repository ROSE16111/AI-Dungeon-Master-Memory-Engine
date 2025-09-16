# Summarizer CLI (BART + optional LoRA)

A one-file, production-ready **long-form summarization** tool with:
- **GPU/CPU auto-detection** (`--device auto|cpu|cuda`)
- **Token-based chunking** to respect encoder limits
- **Progress bars** for end-to-end visibility
- **Optional visualization** of per-chunk token sizes
- **LoRA adapter support** (merge into the base model)

> This README covers **all CLI parameters**, **how it works**, **debugging steps**, and **common issues**.

---

## 1) Features at a glance

- Clear separation of concerns:
  - **Model loading**: `load_summarizer_model()` (base + optional LoRA)
  - **I/O & processing**: `read_input_text()` and summarization pipeline
- **Device selection**: automatic CUDA if available, otherwise CPU
- **Chunk-by-tokens**: prevents exceeding encoder limits (default 1024 with overlap)
- **Per-chunk progress** via `tqdm`
- **PNG chart** for chunk token sizes when `--visualize` is set
- **LoRA on/off**: `--no-lora` to disable and use the base model only

---

## 2) Install

**Python 3.9+** is recommended.

```bash
# Create a fresh virtual environment (recommended)
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

# Install PyTorch that matches your platform (CPU/CUDA)
# Example: CPU wheel
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Other deps
pip install -r requirements_summarizer_cli.txt
```

> If you want CUDA acceleration, install the **CUDA-enabled** PyTorch build that matches your GPU drivers/CUDA version (see official PyTorch install guide).

**Project layout**
```
summarizer/
├─ summarizer_cli.py
├─ requirements_summarizer_cli.txt
└─ transcript.txt        # your input (example)
```

---

## 3) CLI usage (all parameters)

```bash
python summarizer_cli.py [I/O args] [Model args] [Inference args] [Visualization]
```

### I/O
| Argument | Type | Default | Description |
|---|---|---:|---|
| `--input` | str | `None` | Path to input **.txt** file (mutually exclusive with `--text`). |
| `--text` | str | `None` | Inline text content to summarize (mutually exclusive with `--input`). |
| `--out` | str | auto | Output summary file path (defaults to `<input>_summary.txt` or `summary.txt`). |
| `--save-chunk-summaries` | str | `None` | Save **per-chunk** summaries to a file for auditing/review. |

### Model
| Argument | Type | Default | Description |
|---|---|---:|---|
| `--base-model` | str | `facebook/bart-large-cnn` | Hugging Face base model id or local path. |
| `--lora` | str | `Kishan25/Story_Summarizer` | PEFT LoRA adapter id or local path. |
| `--no-lora` | flag | `False` | Disable LoRA; use base model only. |
| `--device` | `auto|cpu|cuda` | `auto` | Device selection. `auto` prefers CUDA when available. |

### Inference
| Argument | Type | Default | Description |
|---|---|---:|---|
| `--max-input-tokens` | int | `1024` | Max encoder tokens per chunk (BART encoders are typically 1024). |
| `--overlap-tokens` | int | `64` | Token overlap between chunks for context continuity. |
| `--gen-min-new` | int | `50` | Minimum new tokens to generate. |
| `--gen-max-new` | int | `150` | Maximum new tokens to generate. |
| `--beams` | int | `4` | Beam search width (higher = better but slower/more memory). |

### Visualization
| Argument | Type | Default | Description |
|---|---|---:|---|
| `--visualize` | flag | `False` | Save a `*.chunks.png` bar chart of token counts per chunk. |

---

## 4) Quick start

```bash
# 1) Summarize a file (auto device)
python summarizer_cli.py --input transcript.txt --out transcript_summary.txt

# 2) Force CPU and disable LoRA
python summarizer_cli.py --input transcript.txt --device cpu --no-lora

# 3) Summarize inline text
python summarizer_cli.py --text "Your long text ..." --out summary.txt

# 4) Save per-chunk summaries & generate visualization
python summarizer_cli.py --input transcript.txt \
  --save-chunk-summaries chunks.txt \
  --visualize
```

The script prints metadata as JSON at the end, e.g.:
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

## 5) How it works

- **Model vs I/O separation**  
  - `load_summarizer_model()` only loads tokenizer/model and (optionally) merges LoRA (`merge_and_unload()`), then moves the model to the chosen device.  
  - `read_input_text()` reads text from **file** or **inline `--text`**.

- **Device & dtype**  
  - Device is selected by `--device` (`auto` uses CUDA if `torch.cuda.is_available()` else CPU).  
  - On CUDA we default to `float16` for inference; on CPU we use `float32`.  
  - Inputs are moved to the **same device** as the model before generation.

- **Chunk-by-tokens**  
  - BART encoders usually accept up to **1024 tokens**.  
  - The script splits long text into token-aligned chunks (with overlap) and summarizes each chunk, then summarizes the concatenated per-chunk summaries to produce a **global summary**.

- **Visualization**  
  - When `--visualize` is set, a non-interactive backend is used to emit a PNG bar chart of token counts per chunk (works on headless servers).

---

## 6) Troubleshooting & debugging

### GPU / CUDA
- **`torch.cuda.is_available()` is False**  
  - Ensure a compatible GPU driver and CUDA runtime are installed.  
  - Install a **CUDA-enabled** PyTorch build matching your CUDA tooling.  
  - Try a clean virtualenv. As a fallback, run with `--device cpu`.

- **`CUDA out of memory` (OOM)**  
  - Lower `--gen-max-new` and/or `--beams`.  
  - Close other GPU workloads.  
  - Ensure `with torch.no_grad()` for inference (already used).  
  - As a last resort, run on CPU.

- **GPU is detected but performance is poor**  
  - Verify the device actually used in the final JSON (`"device": "cuda"`).  
  - Double-check that you didn’t install a CPU-only `torch`.  
  - Mismatch between driver/CUDA and PyTorch can silently degrade to CPU.

### Transformers & generation
- **`generate()` complains about `min_new_tokens`/`max_new_tokens`**  
  - Your `transformers` version is older. Upgrade it (`pip install -U transformers`).  
  - The script already falls back to `max_length/min_length` for compatibility.

- **Summaries are too short/long**  
  - Tune `--gen-min-new` / `--gen-max-new`, and optionally `--beams`.

- **Inputs appear truncated**  
  - Keep `--max-input-tokens` at or below 1024 for BART; rely on chunking.  
  - Adjust `--overlap-tokens` to preserve cross-chunk context.

### Model download / offline use
- **Can’t reach Hugging Face**  
  - If online, retry or configure a proxy.  
  - For **offline**: pre-download the models/tokenizers and pass local paths to `--base-model`/`--lora`.  
  - You may also set `TRANSFORMERS_OFFLINE=1` when the cache is ready.

- **Cache location / permissions**  
  - Ensure the cache directory has enough space and permissions.  
  - You can set `HF_HOME` or `TRANSFORMERS_CACHE` to customize the path.

### Visualization on headless servers
- If you see GUI backend errors, don’t worry—the script forces a **non-interactive** backend to produce PNG files. No display server is required.

### Logging & inspection
- The script logs model/device, load times, chunk counts, and writes a final JSON payload.  
- Use `--save-chunk-summaries` to inspect every intermediate chunk summary.

> **Windows PowerShell quoting tip**: prefer double-quotes around `--text "..."` and escape inner quotes as needed.

---

## 7) Tips for speed & quality

- **Quality-first**: increase `--beams` and `--gen-max-new`, but expect slower inference and higher memory usage.  
- **Speed-first**: `--no-lora`, smaller `--gen-max-new`, and/or CPU on lightweight machines.  
- **Determinism**: pin dependency versions in your requirements for reproducibility.  
- **Offline deploy**: pre-download models and set `TRANSFORMERS_OFFLINE=1`.

---

## 8) Recommended versions

- `transformers` 4.18+ (the script also supports older via fallback)  
- A recent `peft` for stable `merge_and_unload()`  
- `torch` that exactly matches your CUDA/driver setup if using GPU

---

## 9) License

MIT — do what you want, keep the notice.
