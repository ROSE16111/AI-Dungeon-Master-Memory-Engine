# D&D Real-time Voice Recording and Summarization System

A complete AI-powered system for recording D&D game sessions with real-time voice transcription and automatic story summarization.

## 📋 Table of Contents

- [Features](#features)
- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Parameters Explained](#parameters-explained)
- [Troubleshooting](#troubleshooting)
- [Output Files](#output-files)
- [Advanced Configuration](#advanced-configuration)

---

## ✨ Features

- **Real-time Voice Transcription**: Converts speech to text using Faster Whisper
- **Voice Activity Detection (VAD)**: Intelligently detects speech segments
- **Automatic Summarization**: Generates concise summaries every N words using LLM
- **Multiple Output Formats**: Saves transcripts as TXT, SRT, and DOCX
- **Context-Aware**: Remembers previous events for coherent summaries
- **Live Display**: Shows partial and final transcriptions in real-time

---

## 💻 System Requirements

### Minimum Requirements
- **CPU**: Intel Core i5 or AMD Ryzen 5 (4+ cores)
- **RAM**: 8 GB (16 GB recommended)
- **Storage**: 10 GB free space
- **OS**: Windows 10/11, Linux, or macOS
- **Python**: 3.8 - 3.11 (3.10 recommended)

### For GPU Acceleration (Optional)
- **NVIDIA GPU**: GTX 1060 or better
- **VRAM**: 6 GB+ recommended
- **CUDA**: 11.8 or 12.1

---

## 📦 Installation

### Step 1: Install Python Dependencies

```bash
# Install all required packages
pip install -r requirements.txt
```

**Requirements breakdown:**
```
llama-cpp-python>=0.2.0      # LLM inference
faster-whisper>=1.0.0        # Speech recognition
webrtcvad>=2.0.10            # Voice activity detection
sounddevice>=0.4.6           # Audio recording
numpy>=1.24.0                # Numerical operations
soundfile>=0.12.0            # Audio file handling
python-docx>=1.1.0           # Word document export
```

### Step 2: Download the LLM Model

You need a GGUF format LLM model for summarization.

**Recommended Model**: Llama 3.1 8B Instruct Q4_K_M

**Download Options:**

1. **From Hugging Face:**
   ```bash
   # Install huggingface-cli
   pip install huggingface-hub
   
   # Download model
   huggingface-cli download \
     bartowski/Meta-Llama-3.1-8B-Instruct-GGUF \
     Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf \
     --local-dir ./models
   ```

2. **Manual Download:**
   - Visit: https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF
   - Download: `Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf`
   - Place in a folder of your choice

3. **Alternative Models:**
   - **Smaller (4GB)**: `Meta-Llama-3.1-8B-Instruct-Q3_K_M.gguf`
   - **Larger (6GB)**: `Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf`

### Step 3: Update Model Path in Code

Open `dnd_summarizer.py` and find this section at the bottom:

```python
# ============================================
# 🔧 UPDATE THIS PATH TO YOUR MODEL FILE
# ============================================
LLM_MODEL_PATH = r"D:\Program Files\JetBrains\PyCharm 2025.2\Summary\llama.cpp\llama-3.1-8b-instruct-q4_K_M.gguf"
```

**Change it to your model's location:**

```python
# Example paths:
# Windows:
LLM_MODEL_PATH = r"C:\Users\YourName\models\Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"

# Linux/Mac:
LLM_MODEL_PATH = "/home/username/models/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"

# Relative path (model in same folder as script):
LLM_MODEL_PATH = "./Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"
```

---

## ⚙️ Configuration

### Basic Configuration (Bottom of `dnd_summarizer.py`)

```python
# ============================================
# BASIC SETTINGS
# ============================================

# 1. MODEL PATH - Update this to your model location
LLM_MODEL_PATH = r"C:\path\to\your\model.gguf"

# 2. SUMMARIZATION SETTINGS
WORDS_PER_SUMMARY = 150        # Generate summary every N words
                               # Lower = more frequent summaries
                               # Higher = longer segments

# 3. WHISPER MODEL SIZE
WHISPER_MODEL = "small"        # Options: tiny, base, small, medium, large
                               # tiny:   fastest, least accurate (~1GB)
                               # base:   fast, good accuracy (~1.5GB)
                               # small:  balanced (~2GB) ⭐ RECOMMENDED
                               # medium: slow, very accurate (~5GB)
                               # large:  slowest, best accuracy (~10GB)

# 4. DEVICE SETTINGS
WHISPER_DEVICE = "cpu"         # Options: "cpu" or "cuda"
                               # Use "cuda" if you have NVIDIA GPU

LLM_GPU_LAYERS = 0             # Number of layers to offload to GPU
                               # 0 = CPU only
                               # -1 = Use all GPU layers (if GPU available)
                               # 20-30 = Partial GPU offloading

LLM_THREADS = 8                # CPU threads for LLM inference
                               # Set to your CPU core count
                               # Check: Task Manager (Windows) or htop (Linux)
```

### Advanced Audio Configuration (Inside class initialization)

These settings are in the `__init__` method of `DnDVoiceSummarizer` class:

```python
# Audio processing parameters
self.SAMPLE_RATE = 16000       # Audio sample rate (Hz)
                               # 16000 = Standard for speech recognition
                               # Don't change unless you know what you're doing

self.FRAME_MS = 20             # VAD frame duration (milliseconds)
                               # Options: 10, 20, or 30
                               # 20ms is optimal for most cases

self.SILENCE_END_MS = 600      # Silence duration to end utterance (ms)
                               # 600ms = 0.6 seconds of silence
                               # Lower = more sensitive (may cut off speech)
                               # Higher = less sensitive (may merge separate utterances)

self.PARTIAL_INTERVAL = 0.9    # How often to show partial transcription (seconds)
                               # Lower = updates more frequently (more CPU usage)
                               # Higher = less frequent updates

self.OVERLAP_SEC = 0.2         # Audio overlap between segments (seconds)
                               # Ensures no speech is lost at boundaries
                               # 0.2s is recommended
```

---

## 🚀 Usage

### Quick Start

1. **Open terminal/command prompt**
2. **Navigate to script directory:**
   ```bash
   cd /path/to/dnd_summarizer
   ```
3. **Run the script:**
   ```bash
   python dnd_summarizer.py
   ```
4. **Start speaking** - The system will automatically:
   - Detect when you speak (VAD)
   - Transcribe in real-time
   - Generate summaries every 150 words
   - Save everything when you press Ctrl+C

### Running a D&D Session

```bash
# Start recording
python dnd_summarizer.py

# You'll see:
# 1. Model loading progress
# 2. Real-time transcription with timestamps
# 3. Automatic summaries as they're generated
# 4. All outputs saved when you stop (Ctrl+C)
```

### What You'll See During Recording

```
🗣️  [14:23:15] The party enters the dark cave
🗣️  [14:23:42] Elara lights a torch and spots goblin tracks
🗣️  [14:24:08] Three goblins jump out from the shadows

======================================================================
⏳ Generating summary (165 words)...
======================================================================
📝 SUMMARY #1:
   Elara entered the dark cave with the party and discovered goblin tracks
======================================================================

🗣️  [14:24:35] Grim charges forward with his battle axe
```

---

## 📊 Parameters Explained

### Summarization Parameters

#### `WORDS_PER_SUMMARY`
**What it does**: Controls how frequently summaries are generated

**Examples:**
```python
WORDS_PER_SUMMARY = 100   # Summary every ~40 seconds of speech
WORDS_PER_SUMMARY = 150   # Summary every ~1 minute (RECOMMENDED)
WORDS_PER_SUMMARY = 200   # Summary every ~1.5 minutes
WORDS_PER_SUMMARY = 300   # Summary every ~2-3 minutes
```

**Recommendation**: 
- **100-150**: Good for fast-paced games
- **150-200**: Standard D&D sessions ⭐
- **200-300**: Story-heavy, slow-paced games

#### `WHISPER_MODEL`
**What it does**: Determines speech recognition accuracy vs speed

| Model | Size | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| tiny | ~1GB | ⚡⚡⚡⚡ | ⭐⭐ | Testing only |
| base | ~1.5GB | ⚡⚡⚡ | ⭐⭐⭐ | Quick sessions |
| small | ~2GB | ⚡⚡ | ⭐⭐⭐⭐ | **Recommended** ⭐ |
| medium | ~5GB | ⚡ | ⭐⭐⭐⭐⭐ | High accuracy needed |
| large | ~10GB | 🐌 | ⭐⭐⭐⭐⭐ | Best quality (slow) |

**Recommendation**: Start with `small` - it's the sweet spot

#### `WHISPER_DEVICE`
**What it does**: Choose CPU or GPU for speech recognition

```python
WHISPER_DEVICE = "cpu"    # Use CPU (works everywhere)
WHISPER_DEVICE = "cuda"   # Use NVIDIA GPU (faster if available)
```

**How to check if you have CUDA:**
```python
import torch
print(torch.cuda.is_available())  # True = you can use GPU
```

#### `LLM_GPU_LAYERS`
**What it does**: How many model layers to put on GPU

```python
LLM_GPU_LAYERS = 0      # All on CPU (slower but works everywhere)
LLM_GPU_LAYERS = 20     # Some layers on GPU (balanced)
LLM_GPU_LAYERS = -1     # All on GPU (fastest, needs 6GB+ VRAM)
```

**GPU Memory Guide:**
- **4GB VRAM**: `LLM_GPU_LAYERS = 15`
- **6GB VRAM**: `LLM_GPU_LAYERS = 25`
- **8GB+ VRAM**: `LLM_GPU_LAYERS = -1` (all layers)

#### `LLM_THREADS`
**What it does**: CPU threads for LLM inference

**How to find your CPU thread count:**
- **Windows**: Task Manager → Performance → CPU → Logical Processors
- **Linux/Mac**: `lscpu` or `sysctl -n hw.ncpu`

```python
# If you have 8 threads:
LLM_THREADS = 8

# If you have 16 threads:
LLM_THREADS = 16
```

**Recommendation**: Set to your CPU's thread count for best performance

### Audio Processing Parameters

#### `SILENCE_END_MS`
**What it does**: How long to wait in silence before ending an utterance

```python
SILENCE_END_MS = 400    # 0.4s - Very sensitive (may cut off slow speakers)
SILENCE_END_MS = 600    # 0.6s - RECOMMENDED for most cases ⭐
SILENCE_END_MS = 800    # 0.8s - Good for slow/thoughtful speakers
SILENCE_END_MS = 1000   # 1.0s - May merge separate utterances
```

**Adjust if:**
- Speech gets cut off mid-sentence → **Increase** this value
- Separate sentences merge together → **Decrease** this value

#### `PARTIAL_INTERVAL`
**What it does**: How often to update the partial transcription display

```python
PARTIAL_INTERVAL = 0.5   # Update every 0.5s (uses more CPU)
PARTIAL_INTERVAL = 0.9   # Update every 0.9s (RECOMMENDED) ⭐
PARTIAL_INTERVAL = 1.5   # Update every 1.5s (uses less CPU)
```

**Note**: This doesn't affect final transcription quality, only display updates

---

## 🔧 Troubleshooting

### Debugging Voice-to-Text Issues

#### Problem: No transcription appearing

**1. Check your microphone:**
```python
# Add this test at the top of the script:
import sounddevice as sd
print(sd.query_devices())

# Look for your microphone in the list
# Note its index number
```

**2. Set specific microphone:**
```python
# In the start_recording method, modify:
stream = sd.InputStream(
    device=2,  # ADD THIS LINE - use your microphone's index
    samplerate=self.SAMPLE_RATE,
    ...
)
```

**3. Test microphone levels:**
```python
# Add this temporary test code:
def test_microphone():
    import sounddevice as sd
    import numpy as np
    
    def callback(indata, frames, time, status):
        volume = np.linalg.norm(indata) * 10
        print(f"Volume: {'|' * int(volume)}")
    
    with sd.InputStream(callback=callback):
        input("Press Enter to stop...")

# Run before main()
test_microphone()
```

#### Problem: Transcription is inaccurate

**Solutions:**
1. **Use a better model:**
   ```python
   WHISPER_MODEL = "medium"  # or "large"
   ```

2. **Check audio quality:**
   - Use a better microphone
   - Reduce background noise
   - Speak clearly and at moderate pace

3. **Adjust VAD sensitivity:**
   ```python
   # In __init__ method:
   self.vad = webrtcvad.Vad(3)  # Try 0-3 (3 = most aggressive)
   ```

#### Problem: Speech gets cut off

**Solution: Increase silence threshold**
```python
SILENCE_END_MS = 800  # or 1000
```

#### Problem: Separate sentences merge together

**Solution: Decrease silence threshold**
```python
SILENCE_END_MS = 400  # or 500
```

#### Problem: Too slow / High CPU usage

**Solutions:**
1. **Use smaller Whisper model:**
   ```python
   WHISPER_MODEL = "tiny"  # or "base"
   ```

2. **Increase partial interval:**
   ```python
   PARTIAL_INTERVAL = 1.5
   ```

3. **Enable GPU (if available):**
   ```python
   WHISPER_DEVICE = "cuda"
   LLM_GPU_LAYERS = -1
   ```

### Common Errors

#### Error: "libiomp5md.dll already initialized"
**Solution**: Already fixed in code. If still occurs:
```python
# Make sure this is at the top:
import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
```

#### Error: "Could not open audio device"
**Solutions:**
1. Check microphone permissions (Windows Settings → Privacy → Microphone)
2. Close other apps using the microphone
3. Try a different sample rate:
   ```python
   self.SAMPLE_RATE = 48000  # Instead of 16000
   ```

#### Error: "Model file not found"
**Solution**: Check your model path:
```python
# Make sure path is correct and file exists
import os
print(os.path.exists(LLM_MODEL_PATH))  # Should print True
```

#### Error: "CUDA out of memory"
**Solution**: Reduce GPU usage:
```python
LLM_GPU_LAYERS = 20  # Instead of -1
# or
WHISPER_DEVICE = "cpu"
```

---

## 📁 Output Files

After stopping the recording (Ctrl+C), the system generates:

### 1. Transcript File
**Filename**: `dnd_session_YYYYMMDD_HHMMSS_transcript.txt`

**Contents**: Complete transcription of all speech
```
======================================================================
D&D SESSION FULL TRANSCRIPT
Date: 2025-01-09 14:23:45
======================================================================

The party enters the dark cave. Elara lights a torch and spots 
goblin tracks on the ground.

Three goblins jump out from the shadows and attack the party.

Grim charges forward with his battle axe and strikes the first 
goblin for 15 damage.
```

### 2. Summaries File
**Filename**: `dnd_session_YYYYMMDD_HHMMSS_summaries.txt`

**Contents**: All generated summaries
```
======================================================================
D&D GAME SESSION SUMMARIES
Date: 2025-01-09 14:23:45
Total Summaries: 5
======================================================================

1. Elara entered the dark cave with the party and discovered goblin tracks
2. Grim engaged three goblins in combat and defeated the first one
3. The party searched the goblin camp and found a treasure chest
4. Roger picked the lock on the chest and discovered magical items
5. Thelandir identified the items as ancient elven artifacts
```

### 3. SRT Subtitle File
**Filename**: `dnd_session_YYYYMMDD_HHMMSS_transcript.srt`

**Contents**: Subtitle format (for video editing)
```
1
The party enters the dark cave. Elara lights a torch.

2
Three goblins jump out from the shadows and attack.

3
Grim charges forward with his battle axe.
```

### 4. Word Document (Optional)
**Filename**: `dnd_session_YYYYMMDD_HHMMSS_full.docx`

**Contents**: Formatted document with summaries and full transcript

**Requires**: `python-docx` (already in requirements.txt)

---

## 🎮 Advanced Configuration

### Custom Summary Format

The summary format is defined in the `_generate_summary` method. To customize:

```python
# Find this section in the code:
prompt = f"""...
Summarize this segment in ONE sentence following this format:
[Character name] did [specific action] and gained/discovered/encountered [result/outcome]
...
"""

# Change to your preferred format, e.g.:
# "In this scene, [character] [action], resulting in [outcome]"
# "Summary: [what happened]"
```

### Adjust Summary Quality

```python
# In _generate_summary method, modify these:
output = self.llm(
    prompt,
    max_tokens=100,      # Increase for longer summaries (e.g., 150)
    temperature=0.2,     # Lower = more focused (0.1), Higher = more creative (0.5)
    top_p=0.9,          # Nucleus sampling (0.8-0.95 recommended)
    ...
)
```

### Multiple Language Support

```python
# In _transcribe_float32 method:
segments, _ = self.whisper_model.transcribe(
    wave_f32,
    language="en",  # Change to: "zh", "es", "fr", "de", etc.
    ...
)
```

### Disable Specific Outputs

```python
# In _save_all_outputs method, comment out sections you don't need:

# Skip SRT file:
# srt_path = f"{basename}_transcript.srt"
# with open(srt_path, "w", encoding="utf-8") as f:
#     ...

# Skip DOCX file:
# try:
#     from docx import Document
#     ...
```

---

## 📝 Performance Optimization Tips

### For Slower Computers

1. Use smaller models:
   ```python
   WHISPER_MODEL = "tiny"
   # And use Q3 quantized LLM model
   ```

2. Increase intervals:
   ```python
   WORDS_PER_SUMMARY = 200
   PARTIAL_INTERVAL = 1.5
   ```

3. Reduce LLM context:
   ```python
   n_ctx=1024,  # Instead of 2048 in Llama initialization
   ```

### For Faster Computers / GPU Users

1. Use larger models:
   ```python
   WHISPER_MODEL = "large"
   WHISPER_DEVICE = "cuda"
   LLM_GPU_LAYERS = -1
   ```

2. Increase context:
   ```python
   n_ctx=4096,  # In Llama initialization
   ```

3. Lower intervals for more responsive updates:
   ```python
   PARTIAL_INTERVAL = 0.5
   ```

---

## 🆘 Getting Help

### Check System Status

Add this test function to verify everything works:

```python
def system_check():
    """Verify all components are working"""
    print("=== SYSTEM CHECK ===\n")
    
    # 1. Check Python version
    import sys
    print(f"Python: {sys.version}")
    
    # 2. Check packages
    try:
        import llama_cpp
        print("✅ llama-cpp-python")
    except:
        print("❌ llama-cpp-python")
    
    try:
        import faster_whisper
        print("✅ faster-whisper")
    except:
        print("❌ faster-whisper")
    
    try:
        import sounddevice as sd
        print("✅ sounddevice")
        print(f"   Audio devices: {len(sd.query_devices())}")
    except:
        print("❌ sounddevice")
    
    # 3. Check CUDA
    try:
        import torch
        print(f"✅ CUDA available: {torch.cuda.is_available()}")
    except:
        print("⚠️  torch not installed (GPU support unavailable)")
    
    # 4. Check model file
    import os
    print(f"\nModel file exists: {os.path.exists(LLM_MODEL_PATH)}")
    if os.path.exists(LLM_MODEL_PATH):
        size = os.path.getsize(LLM_MODEL_PATH) / (1024**3)
        print(f"Model size: {size:.2f} GB")

# Run before main:
# system_check()
```

### Need More Help?

Check these resources:
- **Llama.cpp**: https://github.com/ggerganov/llama.cpp
- **Faster Whisper**: https://github.com/guillaumekln/faster-whisper
- **WebRTC VAD**: https://github.com/wiseman/py-webrtcvad

---

## 📄 License

This project uses:
- **Llama 3.1**: Meta's license
- **Faster Whisper**: MIT License
- **WebRTC VAD**: BSD License

Please respect all component licenses when using this system.

---

## 🎲 Happy Gaming!

Enjoy your D&D sessions with automatic recording and summarization!