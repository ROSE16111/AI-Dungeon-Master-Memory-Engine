# Back Server - Real-time Speech Transcription
# Back 服务 - 实时语音识别后端

---

## 📖 Introduction | 简介

**English**  
This project provides a WebSocket-based backend service for **real-time speech transcription**.  
It uses [FasterWhisper](https://github.com/SYSTRAN/faster-whisper) for transcription and [WebRTC VAD](https://github.com/wiseman/py-webrtcvad) for detecting voice activity.  
The server receives raw PCM16 audio data, transcribes speech, and sends **partial and final transcription results** back to the client in real time.

**中文**  
该项目实现了一个基于 **WebSocket 的实时语音识别后端服务**。  
它使用 [FasterWhisper](https://github.com/SYSTRAN/faster-whisper) 进行转录，并利用 [WebRTC VAD](https://github.com/wiseman/py-webrtcvad) 来检测语音活动。  
服务器接收 PCM16 原始音频数据，实时输出 **部分转录结果** 和 **最终转录结果** 给客户端。

---

## 📂 Project Structure | 项目结构

```
back-server/
├── src/back.py              # Main program / 主程序
├── requirements.txt         # Dependencies / 依赖文件
├── README.md                # Documentation / 文档
├── .gitignore               # Ignore rules / Git忽略规则
└── LICENSE                  # License / 许可证
```

---

## 📦 Installation | 安装

**English**
```bash
git clone https://github.com/YOUR_USERNAME/back-server.git
cd back-server
pip install -r requirements.txt
```

**中文**
```bash
克隆仓库并进入目录：
git clone https://github.com/YOUR_USERNAME/back-server.git
cd back-server

安装依赖：
pip install -r requirements.txt
```

---

## 🚀 Run Server | 运行服务

**English**
```bash
python src/back.py
```

Server will run at:
```
ws://0.0.0.0:5000/audio
```

**中文**
```bash
python src/back.py
```

服务运行在：
```
ws://0.0.0.0:5000/audio
```

---

## 📡 WebSocket Protocol | WebSocket 协议

**English**
- Client sends: raw PCM16 audio chunks (mono, 16kHz).
- Server responds:
```json
{"partial": "hello wor"}
{"final": "hello world"}
```

**中文**
- 客户端发送：PCM16 原始音频片段（单声道，16kHz）。
- 服务器返回：
```json
{"partial": "你好，世"}
{"final": "你好，世界"}
```

---

## 🧩 Code Explanation | 代码解释

### 1. Imports | 导入库
```python
import asyncio, websockets, json, queue, time
import numpy as np
import webrtcvad
from faster_whisper import WhisperModel
from datetime import datetime
```
**English**: Import libraries for async server, audio processing, and speech recognition.  
**中文**: 导入异步服务器、音频处理、语音识别所需的库。

---

### 2. Configuration | 配置参数
```python
SAMPLE_RATE = 16000
CHANNELS = 1
FRAME_MS = 20
FRAME_SIZE = SAMPLE_RATE * FRAME_MS // 1000
SILENCE_END_MS = 600
PARTIAL_INTERVAL = 0.9
OVERLAP_SEC = 0.2
MODEL_NAME = "small"
LANG = "en"
BEAM = 1
TEMP = 0.0
```
**English**: Define constants for audio format, silence threshold, model type, and decoding settings.  
**中文**: 定义音频格式、静音阈值、模型大小、解码参数等。

---

### 3. Load Models | 加载模型
```python
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
vad = webrtcvad.Vad(2)
```
**English**: Load Whisper speech recognition model and WebRTC VAD for voice activity detection.  
**中文**: 加载 Whisper 语音识别模型，以及 WebRTC VAD 用于检测是否有语音。

---

### 4. Voice Detection | 语音检测
```python
def is_speech_int16(frames_int16: np.ndarray) -> bool:
    return vad.is_speech(frames_int16.tobytes(), SAMPLE_RATE)
```
**English**: Detect if audio contains speech.  
**中文**: 判断当前音频片段是否包含语音。

---

### 5. Transcription | 转录
```python
def transcribe_float32(wave_f32: np.ndarray) -> str:
    segments, _ = model.transcribe(
        wave_f32, language=LANG, beam_size=BEAM, temperature=TEMP
    )
    return "".join(seg.text for seg in segments).strip()
```
**English**: Convert audio waveform into text using FasterWhisper.  
**中文**: 使用 FasterWhisper 将音频波形转录为文字。

---

### 6. WebSocket Handler | WebSocket 处理逻辑
```python
async def audio_handler(websocket):
    async for message in websocket:
        pcm16 = np.frombuffer(message, dtype=np.int16)
        voiced = is_speech_int16(pcm16)
        # handle speech and silence...
```
**English**: Handle audio chunks from client, detect speech, perform transcription, and send results back.  
**中文**: 处理客户端传来的音频片段，检测语音，转录并返回结果。

---

### 7. Start Server | 启动服务
```python
async def main():
    async with websockets.serve(audio_handler, "0.0.0.0", 5000):
        await asyncio.Future()
```
**English**: Start WebSocket server at port 5000.  
**中文**: 启动 WebSocket 服务，监听 5000 端口。

---

## 🛠️ How to Modify & Debug | 如何修改与调试

**English**
- Change `MODEL_NAME` (`tiny`, `base`, `small`, `medium`, `large`) to adjust recognition speed/accuracy.  
- Adjust `SILENCE_END_MS` to detect end of speech faster/slower.  
- Modify `LANG` to force recognition language.  
- Debug by printing intermediate values (e.g., `print(pcm16.shape)`).  
- Use `device="cuda"` if you have a GPU to speed up transcription.

**中文**
- 修改 `MODEL_NAME` (`tiny`, `base`, `small`, `medium`, `large`) 来平衡识别速度和准确率。  
- 调整 `SILENCE_END_MS` 以改变语音结束检测的灵敏度。  
- 修改 `LANG` 来强制识别指定语言。  
- 调试时可以打印中间变量（例如 `print(pcm16.shape)`）。  
- 如果有 GPU，可将 `device="cuda"` 提高识别速度。  

---
