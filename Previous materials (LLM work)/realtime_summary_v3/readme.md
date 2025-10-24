D&D Voice Recorder - Enhanced Edition
Real-time voice recording and summarization system for D&D game sessions with advanced noise reduction and AI-powered voice activity detection.

Features
Real-time Transcription: Converts speech to text using Faster Whisper
Automatic Summarization: Generates concise summaries of game segments using local LLM
Noise Reduction: Advanced spectral noise reduction for noisy environments
Silero VAD: Deep learning-based voice activity detection with confidence scoring
Multiple Output Formats: TXT, SRT, and DOCX file generation
Adaptive Detection: Learns noise profile from environment during startup
System Requirements
Hardware
Microphone: Any standard audio input device
RAM: Minimum 8GB (16GB recommended)
Storage: ~5GB for models
CPU: Multi-core processor (or CUDA-capable GPU for acceleration)
Software
Python 3.8 or higher
Windows/Linux/macOS
Installation
1. Clone or Download
Download the dnd_voice_enhanced.py file to your working directory.

2. Install Dependencies
bash
pip install -r requirements.txt
3. Download LLM Model
Download a GGUF format LLM model (recommended: Llama 3.1 8B Instruct Q4):

From Hugging Face:
  https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF
Look for files ending in .gguf (Q4_K_M recommended for balance)
4. Configure Model Path
Edit the LLM_MODEL_PATH variable in dnd_voice_enhanced.py:

python
LLM_MODEL_PATH = r"path/to/your/llama-3.1-8b-instruct-q4_K_M.gguf"
Usage
Basic Usage
bash
python dnd_voice_enhanced.py
The system will:

Load all models (takes 30-60 seconds)
Learn noise profile for 2 seconds (stay quiet)
Start listening for speech
Generate summaries automatically every 150 words
Press Ctrl+C to stop and save files
Configuration
Edit these variables in the script:

python
# Transcription settings
WORDS_PER_SUMMARY = 150        # Words before generating summary
WHISPER_MODEL = "small"        # tiny/base/small/medium/large
WHISPER_DEVICE = "cpu"         # cpu or cuda

# LLM settings
LLM_GPU_LAYERS = 0             # 0 for CPU, -1 for all GPU layers
LLM_THREADS = 8                # CPU threads for LLM

# Noise reduction
NOISE_REDUCE_STRENGTH = 0.7    # 0.5-0.9 (higher = more reduction)
VAD_THRESHOLD = 0.5            # 0.3-0.7 (higher = stricter detection)
Environment-Specific Settings
Environment	NOISE_REDUCE_STRENGTH	VAD_THRESHOLD
Quiet room	0.5	0.4
Light noise	0.6	0.5
Cafe	0.7	0.5
Very noisy	0.8	0.6
Output Files
The system generates timestamped files:

1. Transcript (*_transcript.txt)
Full verbatim transcript of all speech with timestamps.

2. Summaries (*_summaries.txt)
Concise one-sentence summaries of game segments:

1. Elara investigated the abandoned temple and discovered an enchanted sword
2. The dwarf Grim defeated the orc chieftain and earned the tribe's respect
3. SRT Subtitles (*_transcript.srt)
Subtitle format for video editing or reference.

4. Word Document (*_full.docx)
Complete formatted document with summaries and transcript.

How It Works
Noise Reduction Pipeline
Raw Audio
    ↓
[Learn Noise Profile] (first 2 seconds)
    ↓
[Spectral Subtraction] (remove background noise)
    ↓
[Silero VAD] (detect speech with AI)
    ↓
[Whisper Transcription]
    ↓
[LLM Summarization]
Voice Activity Detection
The system uses a two-stage approach:

Silero VAD: Deep learning model provides 0-1 confidence score
Energy Threshold: Backup method if VAD unavailable
Multi-frame Confirmation: Requires 3 consecutive frames to start recording
Minimum Duration: Filters out sounds shorter than 300ms
Summarization Strategy
Monitors word count continuously
Generates summary when threshold reached (default: 150 words)
Uses context from previous 3 summaries for continuity
Follows D&D-specific format: [Who] [Action] [Outcome]
Troubleshooting
"Failed to load Silero VAD"
The system will fall back to energy-based detection. To fix:

bash
pip install --upgrade torch
"Audio device not found"
List available devices:

python
import sounddevice as sd
print(sd.query_devices())
Then modify the script to specify device ID.

"Model loading takes too long"
Use smaller Whisper model: WHISPER_MODEL = "base"
Use quantized LLM: Look for Q4_K_M or Q3_K_M versions
Enable GPU acceleration if available
Poor transcription quality
Increase NOISE_REDUCE_STRENGTH to 0.8
Increase VAD_THRESHOLD to 0.6
Move microphone closer to speaker
Use better quality microphone
Too many false detections
Increase VAD_THRESHOLD to 0.6 or 0.7
Increase SILENCE_END_MS to 1000
Reduce NOISE_REDUCE_STRENGTH if it's causing artifacts
Performance Tips
For CPU-only systems:
python
WHISPER_MODEL = "base"         # Faster, slightly lower quality
LLM_THREADS = 8                # Match your CPU core count
LLM_GPU_LAYERS = 0
For GPU-accelerated systems:
python
WHISPER_DEVICE = "cuda"
LLM_GPU_LAYERS = -1            # Use all GPU layers
Memory optimization:
python
WORDS_PER_SUMMARY = 200        # Summarize less frequently
WHISPER_MODEL = "tiny"         # Smallest model
Technical Details
Models Used
Whisper (OpenAI)
Speech-to-text transcription
Multilingual support
Size: 140MB (tiny) to 2.9GB (large)
Silero VAD (Silero)
Voice activity detection
PyTorch-based neural network
Size: ~1.5MB
Llama 3.1 (Meta)
Summarization LLM
GGUF quantized format
Size: ~4-8GB depending on quantization
Audio Processing
Sample Rate: 16kHz (optimal for speech)
Frame Duration: 30ms (Silero recommendation)
Overlap: 200ms for context continuity
Silence Threshold: 800ms (adjustable)
Minimum Speech: 300ms (filters short noises)
License
This project uses several open-source components:

Faster Whisper: MIT License
Silero VAD: MIT License
llama.cpp: MIT License
noisereduce: MIT License
Please ensure your LLM model usage complies with its license terms.

Contributing
Suggestions for improvement:

Support for multiple speakers
Real-time streaming to external services
Custom vocabulary for fantasy terms
Integration with VTT platforms
Support
For issues or questions:

Check the Troubleshooting section
Verify all dependencies are installed
Test with minimal settings first
Check model file paths are correct
Changelog
Version 2.0 (Enhanced Edition)
Added Silero VAD for improved speech detection
Integrated noise reduction preprocessing
Adaptive noise profile learning
Multi-frame confirmation for robustness
Confidence scoring display
Improved silence detection logic
Version 1.0 (Original)
Basic WebRTC VAD
Whisper transcription
LLM summarization
Multiple output formats
