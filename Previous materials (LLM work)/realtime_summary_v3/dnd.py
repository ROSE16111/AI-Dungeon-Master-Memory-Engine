"""
D&D Real-time Voice Recording with Noise Reduction + Silero VAD
Enhanced version for noisy environments
"""

import os

os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

import sys
import time
import queue
import re
import threading
from typing import List, Dict
import numpy as np
import sounddevice as sd
import torch
import noisereduce as nr
from faster_whisper import WhisperModel
from datetime import datetime


class DnDVoiceSummarizerEnhanced:
    """Enhanced D&D voice recording system with noise reduction and Silero VAD"""

    def __init__(self, llm_model_path: str, words_per_chunk=150,
                 whisper_model_size="small", whisper_device="cpu",
                 llm_gpu_layers=0, llm_threads=8,
                 noise_reduce_strength=0.7, vad_threshold=0.5):
        """
        Initialize the enhanced system

        Args:
            llm_model_path: Path to GGUF model file
            words_per_chunk: Word threshold for summaries
            whisper_model_size: Whisper model size
            whisper_device: Device for Whisper
            llm_gpu_layers: GPU layers for LLM
            llm_threads: CPU threads for LLM
            noise_reduce_strength: Noise reduction strength (0-1, default 0.7)
            vad_threshold: Silero VAD threshold (0-1, default 0.5)
        """
        print("=" * 70)
        print("D&D VOICE RECORDER - ENHANCED EDITION")
        print("Noise Reduction + Silero VAD")
        print("=" * 70)

        # Configuration
        self.llm_model_path = llm_model_path
        self.words_per_chunk = words_per_chunk
        self.whisper_model_size = whisper_model_size
        self.whisper_device = whisper_device
        self.llm_gpu_layers = llm_gpu_layers
        self.llm_threads = llm_threads

        # Enhanced audio settings
        self.SAMPLE_RATE = 16000
        self.CHANNELS = 1
        self.FRAME_MS = 30  # Silero推荐30ms
        self.FRAME_SIZE = self.SAMPLE_RATE * self.FRAME_MS // 1000
        self.SILENCE_END_MS = 800  # 延长到800ms
        self.MIN_SPEECH_MS = 300  # 最短发言300ms
        self.PARTIAL_INTERVAL = 1.0
        self.OVERLAP_SEC = 0.2

        # Noise reduction settings
        self.noise_reduce_strength = noise_reduce_strength
        self.noise_profile = None  # Noise profile learned from initial frames
        self.noise_learning_frames = 50  # Number of frames for noise learning

        # Silero VAD settings
        self.vad_threshold = vad_threshold
        self.vad_model = None

        # Energy threshold (backup)
        self.energy_threshold = 300  # Adjustable based on environment

        # Models
        self.llm = None
        self.whisper_model = None

        # Recording state
        self.is_recording = False
        self.audio_queue = queue.Queue(maxsize=200)
        self.session_start = None

        # Transcription state
        self.all_segments = []
        self.full_transcript = []
        self.transcription_buffer = ""

        # Summary state
        self.summaries = []
        self.context_buffer = []

        # Load models
        self._load_models()

    def _load_models(self):
        """Load all required models"""
        print("\nLoading enhanced models...\n")

        # Load Silero VAD
        try:
            print("Loading Silero VAD model...")
            self.vad_model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                onnx=False
            )
            self.vad_model.eval()
            print("Silero VAD loaded successfully!")
        except Exception as e:
            print(f"Failed to load Silero VAD: {str(e)}")
            print("   Fallback: Will use energy-based detection")
            self.vad_model = None

        # Load LLM
        try:
            from llama_cpp import Llama
            print(f"\nLoading LLM model: {self.llm_model_path}")
            self.llm = Llama(
                model_path=self.llm_model_path,
                n_ctx=2048,
                n_threads=self.llm_threads,
                n_gpu_layers=self.llm_gpu_layers,
                verbose=False
            )
            print("LLM model loaded successfully!")
        except Exception as e:
            print(f"Failed to load LLM: {str(e)}")
            raise

        # Load Whisper
        try:
            print(f"\nLoading Whisper model ({self.whisper_model_size})...")
            self.whisper_model = WhisperModel(
                self.whisper_model_size,
                device=self.whisper_device,
                compute_type="int8"
            )
            print("Whisper model loaded successfully!")
        except Exception as e:
            print(f"Failed to load Whisper: {str(e)}")
            raise

        print("\n" + "=" * 70)
        print("All enhanced models loaded!")
        print(f"Noise Reduction: {self.noise_reduce_strength * 100:.0f}%")
        print(f" VAD Threshold: {self.vad_threshold}")
        print("=" * 70 + "\n")

    def _calculate_energy(self, pcm16: np.ndarray) -> float:
        """Calculate audio energy (RMS)"""
        return np.sqrt(np.mean(pcm16.astype(np.float32) ** 2))

    def _apply_noise_reduction(self, pcm16: np.ndarray) -> np.ndarray:
        """Apply noise reduction to audio"""
        try:
            # Convert to float32
            audio_float = pcm16.astype(np.float32) / 32768.0

            # Apply noise reduction
            reduced = nr.reduce_noise(
                y=audio_float,
                sr=self.SAMPLE_RATE,
                stationary=True,  # Good for continuous background noise
                prop_decrease=self.noise_reduce_strength,
                freq_mask_smooth_hz=500,
                time_mask_smooth_ms=50
            )

            # Convert back to int16
            return (reduced * 32768.0).astype(np.int16)
        except Exception as e:
            # If noise reduction fails, return original
            return pcm16

    def _is_speech_silero(self, pcm16: np.ndarray) -> tuple[bool, float]:
        """
        Check if audio contains speech using Silero VAD
        Returns: (is_speech, confidence)
        """
        if self.vad_model is None:
            # Fallback to energy-based detection
            energy = self._calculate_energy(pcm16)
            is_speech = energy > self.energy_threshold
            return is_speech, energy / 1000.0  # Normalize to 0-1

        try:
            # Convert to float32 tensor
            audio_float = pcm16.astype(np.float32) / 32768.0
            audio_tensor = torch.from_numpy(audio_float)

            # Get speech probability
            with torch.no_grad():
                speech_prob = self.vad_model(audio_tensor, self.SAMPLE_RATE).item()

            is_speech = speech_prob > self.vad_threshold
            return is_speech, speech_prob

        except Exception as e:
            # Fallback to energy
            energy = self._calculate_energy(pcm16)
            is_speech = energy > self.energy_threshold
            return is_speech, energy / 1000.0

    def _audio_callback(self, indata, frames, time_info, status):
        """Audio input callback"""
        if status:
            pass
        self.audio_queue.put(indata.copy())

    def _transcribe_float32(self, wave_f32: np.ndarray) -> str:
        """Transcribe audio using Whisper"""
        segments, _ = self.whisper_model.transcribe(
            wave_f32,
            language="en",
            beam_size=1,
            temperature=0.0,
            vad_filter=False,
            no_speech_threshold=0.4,
            compression_ratio_threshold=2.4,
        )
        return "".join(seg.text for seg in segments).strip()

    def _count_words(self, text: str) -> int:
        """Count words in text"""
        return len(re.findall(r'\b[a-zA-Z]+\b', text))

    def _generate_summary(self, text: str, index: int) -> str:
        """Generate summary for text"""
        context = ""
        if self.context_buffer:
            context = "Previous events:\n" + "\n".join(self.context_buffer[-3:]) + "\n\n"

        prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are a D&D game session recorder. Your task is to summarize game segments into concise records.<|eot_id|><|start_header_id|>user<|end_header_id|>

{context}Current game segment:
{text}

Summarize this segment in ONE sentence following this format:
[Character name] did [specific action] and gained/discovered/encountered [result/outcome]

Requirements:
1. ONE sentence only, maximum 50 words
2. Must include: subject (who), action (what they did), outcome (result/consequence)
3. If multiple characters, clarify all the characters and give out all of their action and movement
4. Focus on key actions, ignore dialogue details
5. Use past tense
6. Do NOT add prefixes like "Summary:" - output the summary directly<|eot_id|><|start_header_id|>assistant<|end_header_id|>

"""

        try:
            output = self.llm(
                prompt,
                max_tokens=100,
                temperature=0.2,
                top_p=0.9,
                stop=["<|eot_id|>", "\n\n"],
                echo=False
            )

            summary = output['choices'][0]['text'].strip()
            summary = re.sub(r'^(Summary:|Note:|Recap:)\s*', '', summary, flags=re.IGNORECASE)
            summary = summary.split('\n')[0]
            return summary
        except Exception as e:
            return f"[Summary generation failed: {str(e)}]"

    def _summarization_thread(self):
        """Background thread for generating summaries"""
        while self.is_recording:
            time.sleep(5)

            word_count = self._count_words(self.transcription_buffer)
            if word_count >= self.words_per_chunk:
                print(f"\n{'=' * 70}")
                print(f" Generating summary ({word_count} words)...")
                print(f"{'=' * 70}")

                summary = self._generate_summary(
                    self.transcription_buffer,
                    len(self.summaries) + 1
                )

                print(f" SUMMARY #{len(self.summaries) + 1}:")
                print(f"   {summary}")
                print(f"{'=' * 70}\n")

                self.summaries.append(summary)
                self.context_buffer.append(f"{len(self.summaries)}. {summary}")
                if len(self.context_buffer) > 3:
                    self.context_buffer.pop(0)

                self.transcription_buffer = ""

    def start_recording(self):
        """Start enhanced voice recording"""
        self.is_recording = True
        self.session_start = time.time()

        print("\n" + "=" * 70)
        print(" STARTING ENHANCED VOICE RECORDING")
        print("=" * 70)
        print(f" Configuration:")
        print(f"   - Sample Rate: {self.SAMPLE_RATE} Hz")
        print(f"   - Noise Reduction: {self.noise_reduce_strength * 100:.0f}%")
        print(f"   - VAD Threshold: {self.vad_threshold}")
        print(f"   - Summary Every: {self.words_per_chunk} words")
        print("\n Speak now! Press Ctrl+C to stop.\n")
        print("=" * 70 + "\n")

        # Start audio stream
        try:
            stream = sd.InputStream(
                samplerate=self.SAMPLE_RATE,
                blocksize=self.FRAME_SIZE,
                channels=self.CHANNELS,
                dtype="int16",
                callback=self._audio_callback,
            )
            stream.start()
        except Exception as e:
            print(f" Failed to start audio stream: {e}")
            raise

        # Start summarization thread
        summary_thread = threading.Thread(target=self._summarization_thread, daemon=True)
        summary_thread.start()

        # Main transcription loop
        speaking = False
        speech_frames = 0
        silence_frames = 0
        last_partial_time = 0.0
        last_partial_text = ""

        tail = np.zeros(int(self.OVERLAP_SEC * self.SAMPLE_RATE), dtype=np.int16)
        buf = []
        utt_start_wall = None

        # Noise learning phase
        noise_frames_collected = []
        learning_noise = True

        try:
            while True:
                indata = self.audio_queue.get(timeout=1)

                # Convert to int16
                if indata.ndim > 1:
                    pcm16 = np.frombuffer(indata, dtype=np.int16).reshape(-1, self.CHANNELS)[:, 0]
                else:
                    pcm16 = np.frombuffer(indata, dtype=np.int16)

                # Noise learning phase (first 2 seconds)
                if learning_noise:
                    noise_frames_collected.append(pcm16)
                    if len(noise_frames_collected) >= self.noise_learning_frames:
                        print("Noise profile learned, starting detection...")
                        learning_noise = False
                    continue

                # Apply noise reduction
                pcm16_clean = self._apply_noise_reduction(pcm16)

                # Enhanced VAD check
                is_speech, confidence = self._is_speech_silero(pcm16_clean)

                # Display confidence periodically
                if int(time.time() * 2) % 10 == 0:  # Every 5 seconds
                    print(f"\r[VAD confidence: {confidence:.2f}]", end="", flush=True)

                if is_speech:
                    speech_frames += 1
                    silence_frames = 0

                    # Start speaking (requires multiple consecutive frames for confirmation)
                    if not speaking and speech_frames >= 3:
                        speaking = True
                        utt_start_wall = time.time()
                        print(f"\r [Speech detected, confidence: {confidence:.2f}]", end="", flush=True)

                    if speaking:
                        buf.append(pcm16_clean)

                        # Partial transcription
                        if time.time() - last_partial_time >= self.PARTIAL_INTERVAL:
                            chunk = np.concatenate([tail, *buf]) if buf else tail
                            wave = chunk.astype(np.float32) / 32768.0
                            try:
                                text = self._transcribe_float32(wave)
                                if text and text != last_partial_text:
                                    print(f"\r[partial] {text}", end="", flush=True)
                                    last_partial_text = text
                            except Exception:
                                pass
                            last_partial_time = time.time()

                else:
                    silence_frames += 1
                    speech_frames = max(0, speech_frames - 1)

                    # End of utterance
                    if speaking and silence_frames * self.FRAME_MS >= self.SILENCE_END_MS:
                        # Check minimum speech duration
                        speech_duration_ms = len(buf) * self.FRAME_MS
                        if speech_duration_ms < self.MIN_SPEECH_MS:
                            # Too short, ignore
                            speaking = False
                            buf.clear()
                            speech_frames = 0
                            continue

                        speaking = False
                        utt_end_wall = time.time()
                        utter = np.concatenate([tail, *buf]) if buf else tail
                        wave = utter.astype(np.float32) / 32768.0

                        try:
                            final_text = self._transcribe_float32(wave)
                            if final_text:
                                print("\r" + " " * 120, end="\r")
                                timestamp = time.strftime("%H:%M:%S")
                                print(f"🗣️  [{timestamp}] {final_text}", flush=True)

                                self.transcription_buffer += " " + final_text

                                rel_start = max(0.0, (utt_start_wall or time.time()) - self.session_start)
                                rel_end = max(rel_start, utt_end_wall - self.session_start)
                                self.all_segments.append({
                                    "start": rel_start,
                                    "end": rel_end,
                                    "text": final_text
                                })
                                self.full_transcript.append(final_text)
                        except Exception as e:
                            print(f"\n[warn] transcription failed: {e}")

                        # Update tail
                        if utter.size >= tail.size:
                            tail = utter[-tail.size:].copy()
                        else:
                            z = np.zeros(tail.size - utter.size, dtype=np.int16)
                            tail = np.concatenate([z, utter])
                        buf.clear()
                        last_partial_text = ""
                        last_partial_time = time.time()
                        utt_start_wall = None
                        speech_frames = 0

        except KeyboardInterrupt:
            print("\n\n" + "=" * 70)
            print("STOPPING RECORDING...")
            print("=" * 70)
        finally:
            # Finalize
            if speaking and buf:
                try:
                    utter = np.concatenate([tail, *buf])
                    wave = utter.astype(np.float32) / 32768.0
                    final_text = self._transcribe_float32(wave)
                    if final_text:
                        print(f"\n🗣️  [final] {final_text}", flush=True)
                        self.transcription_buffer += " " + final_text
                        self.full_transcript.append(final_text)
                except Exception:
                    pass

            # Generate final summary
            if self.transcription_buffer.strip() and self._count_words(self.transcription_buffer) > 20:
                print("\nGenerating final summary...")
                summary = self._generate_summary(
                    self.transcription_buffer,
                    len(self.summaries) + 1
                )
                self.summaries.append(summary)
                print(f"Final summary: {summary}\n")

            self.is_recording = False
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass

            if self.full_transcript:
                self._save_all_outputs()

            print("\n[Session ended]")

    def _save_all_outputs(self):
        """Save all outputs"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        basename = f"dnd_session_{timestamp}"

        print("\n" + "=" * 70)
        print(" SAVING FILES...")
        print("=" * 70)

        # Save transcript
        txt_path = f"{basename}_transcript.txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write("=" * 70 + "\n")
            f.write("D&D SESSION TRANSCRIPT (Enhanced)\n")
            f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 70 + "\n\n")
            f.write("\n\n".join(self.full_transcript).strip() + "\n")
        print(f"Transcript: {txt_path}")

        # Save summaries
        summary_path = f"{basename}_summaries.txt"
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write("=" * 70 + "\n")
            f.write("D&D SESSION SUMMARIES\n")
            f.write(f"Total: {len(self.summaries)}\n")
            f.write("=" * 70 + "\n\n")
            for i, summary in enumerate(self.summaries, 1):
                f.write(f"{i}. {summary}\n")
        print(f" Summaries: {summary_path}")

        print("\n" + "=" * 70)
        print("STATISTICS")
        print("=" * 70)
        print(f"Summaries: {len(self.summaries)}")
        print(f"Words: {sum(self._count_words(t) for t in self.full_transcript)}")
        print(f"Segments: {len(self.all_segments)}")
        print("=" * 70)


# Main execution
if __name__ == "__main__":
    # Configuration
    LLM_MODEL_PATH = r"D:\Program Files\JetBrains\PyCharm 2025.2\Summary\llama.cpp\llama-3.1-8b-instruct-q4_K_M.gguf"

    # Settings
    WORDS_PER_SUMMARY = 150
    WHISPER_MODEL = "small"
    WHISPER_DEVICE = "cpu"
    LLM_GPU_LAYERS = 0
    LLM_THREADS = 8

    # Enhanced settings
    NOISE_REDUCE_STRENGTH = 0.7  # 0-1, 0.7 = 70% 降噪
    VAD_THRESHOLD = 0.5  # 0-1, 越高越严格

    try:
        print("\n Initializing Enhanced D&D Voice Recorder...")
        print("Required packages: torch, noisereduce, faster-whisper, llama-cpp-python\n")

        summarizer = DnDVoiceSummarizerEnhanced(
            llm_model_path=LLM_MODEL_PATH,
            words_per_chunk=WORDS_PER_SUMMARY,
            whisper_model_size=WHISPER_MODEL,
            whisper_device=WHISPER_DEVICE,
            llm_gpu_layers=LLM_GPU_LAYERS,
            llm_threads=LLM_THREADS,
            noise_reduce_strength=NOISE_REDUCE_STRENGTH,
            vad_threshold=VAD_THRESHOLD
        )

        summarizer.start_recording()

    except Exception as e:
        print(f"\n Fatal error: {str(e)}")
        import traceback

        traceback.print_exc()