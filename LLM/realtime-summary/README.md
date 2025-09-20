# README — Realtime Transcription (实时转写) + Local LLM Summarizer (本地总结器)

This project provides a Python script that uses **faster-whisper** for real-time speech-to-text and a **local Llama GGUF model** for summarization.  

运行后：  
- `[partial]` → shows interim recognition results while you speak.  
- `[final]` → outputs a confirmed sentence after a short silence.  
- `[summary]` → when cached transcript reaches a threshold, it calls the local LLM to produce concise bullet points.  

---

## 1. Microphone Setup (确认麦克风设备)

To find available microphones on your system:

```python
import sounddevice as sd
print(sd.query_devices())
```

Example output:

```
0 Microsoft Sound Mapper - Input, MME (2 in, 0 out)
1 Microphone Array (Realtek(R) Audio), MME (2 in, 0 out)
...
```

- Pick the correct **device ID** for your microphone (e.g., `1`).  
- In the script, the default is `sd.default.device[0]`.  
- You can explicitly set `device=1` in the `InputStream` if needed.  

---

## 2. Whisper Model Location (Whisper 模型位置)

In the script:

```python
MODEL_NAME = "small"
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
```

- Supported model names: `tiny`, `base`, `small`, `medium`, `large-v2`, `large-v3`.  
- On first run, the model will be automatically downloaded and cached in  
  - Linux/macOS: `~/.cache/huggingface`  
  - Windows: `%USERPROFILE%\.cache\huggingface`  

To change the model, modify `MODEL_NAME`.  

---

## 3. Llama GGUF Model Path (本地 Llama 模型路径)

Summarization uses a local GGUF file:

```python
llm = lazy_init_llm(
    r"D:\Program Files\PyCharm\Summary\llama.cpp\llama-3.1-8b-instruct-q4_K_M.gguf",
    n_ctx=4096, n_gpu_layers=0
)
```

- Replace the path with your local GGUF model file.  
- `n_gpu_layers=0` means run entirely on CPU.  
- If you have a GPU, you can offload some layers, e.g., `n_gpu_layers=20`.  

---

## 4. Transcript Output (转写输出位置)

- `[partial]` and `[final]` are printed live in the terminal.  
- `[summary]` is also printed when triggered.  
- By default, results are **not saved**.  
- To save, add code like:  

```python
with open("transcript.txt", "a", encoding="utf-8") as f:
    f.write(final_text + "\n")
```

Or for summaries:  

```python
with open("summary.txt", "a", encoding="utf-8") as f:
    f.write(summary + "\n")
```

---

## 5. Audio Processing Parameters (音频处理参数)

### `FRAME_MS = 20`
- Audio frame size in milliseconds.  
- Allowed: **10 / 20 / 30** (WebRTC VAD limitation).  
- Smaller = faster callbacks, lower latency, higher CPU.  
- Default **20ms** is recommended.  

### `PARTIAL_INTERVAL = 0.9`
- Interval (in seconds) to refresh `[partial]` transcription.  
- Smaller → more frequent updates.  
- Example:  
  ```python
  PARTIAL_INTERVAL = 0.5
  ```

### `SILENCE_END_MS = 600`
- Silence duration (ms) to decide an utterance has ended.  
- Default: 600ms (0.6s).  
- Increase if you pause often:  
  ```python
  SILENCE_END_MS = 1000
  ```
- Decrease for quicker cutoffs:  
  ```python
  SILENCE_END_MS = 300
  ```

### `OVERLAP_SEC = 0.2`
- Overlap between segments to avoid missing words when cutting.  
- Default: 0.2s.  
- Can be increased to 0.3s if you find truncation issues.  

---

## 6. Summarization Trigger (总结触发条件)

In the script:

```python
if len(cache_text) >= 100:
    summary = summarize_text(llm, cache_text)
```

- Trigger when cached transcript length ≥ **100 characters**.  
- Adjust as needed:  
  - Smaller (50) → more frequent summaries.  
  - Larger (300) → longer context before summarizing.  

---

## 7. Whisper Recognition Parameters (Whisper 识别参数)

- `LANG = "en"` → force English recognition.  
- For Chinese, set:  
  ```python
  LANG = "zh"
  ```  
- `BEAM = 1` → beam search width. Use `5` for better accuracy but slower.  
- `TEMP = 0.0` → temperature (0 = deterministic).  

---

## 8. Recommended Configurations (推荐配置)

- **Low latency / fast refresh:**  
  ```
  FRAME_MS = 10
  PARTIAL_INTERVAL = 0.5
  SILENCE_END_MS = 400
  ```

- **Stable & complete sentences:**  
  ```
  FRAME_MS = 20
  PARTIAL_INTERVAL = 1.0
  SILENCE_END_MS = 1000
  ```

- **More context before summarization:**  
  ```
  if len(cache_text) >= 300:
      ...
  ```

---

📌 With these parameters, you can balance **latency**, **accuracy**, and **summary frequency** according to your needs.  
