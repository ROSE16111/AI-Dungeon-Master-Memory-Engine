import sys, time, queue
import numpy as np
import sounddevice as sd
import webrtcvad
from faster_whisper import WhisperModel
from datetime import datetime

# ========= Configuration =========
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

OUTPUT_BASENAME = datetime.now().strftime("transcript_%Y%m%d_%H%M%S")

# ========= Whisper Init =========
def load_model():
    print("[Init] faster-whisper (CPU int8)")
    return WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")

model = load_model()
vad = webrtcvad.Vad(2)

audio_q: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=200)

def audio_callback(indata, frames, time_info, status):
    if not status:
        audio_q.put(indata.copy())

def start_stream():
    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        blocksize=FRAME_SIZE,
        channels=CHANNELS,
        dtype="int16",
        callback=audio_callback,
    )
    stream.start()
    return stream

def is_speech_int16(frames_int16: np.ndarray) -> bool:
    try:
        return vad.is_speech(frames_int16.tobytes(), SAMPLE_RATE)
    except Exception:
        return False

def transcribe_float32(wave_f32: np.ndarray) -> str:
    segments, _ = model.transcribe(
        wave_f32,
        language=LANG,
        beam_size=BEAM,
        temperature=TEMP,
        vad_filter=False,
        no_speech_threshold=0.4,
        compression_ratio_threshold=2.4,
    )
    return "".join(seg.text for seg in segments).strip()

def sec_to_srt(ts: float) -> str:
    if ts < 0: ts = 0.0
    h = int(ts // 3600); ts -= h * 3600
    m = int(ts // 60);   ts -= m * 60
    s = int(ts);         ms = int(round((ts - s) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

# ========= Local Llama =========
_LLM = None
SYS_PROMPT = (
    "You are a real-time meeting summarization assistant. "
    "Respond in concise English bullet points. "
    "Do not repeat the transcript verbatim. "
    "If information is incomplete, explicitly mention uncertainties."
)

def lazy_init_llm(gguf_path, n_ctx=4096, n_gpu_layers=0):
    global _LLM
    if _LLM is None:
        from llama_cpp import Llama
        print(f"[Init] Loading local Llama model: {gguf_path}")
        _LLM = Llama(
            model_path=gguf_path,
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            chat_format="llama-3",
            verbose=False,
        )
    return _LLM

def summarize_text(llm, text, bullets=5):
    msgs = [
        {"role": "system", "content": SYS_PROMPT},
        {"role": "user", "content": f"[Context]\n{text}\n\nSummarize into:\n- Key points (max {bullets})\n- Next actions (if any)\n"}
    ]
    out = llm.create_chat_completion(messages=msgs, temperature=0.2, max_tokens=200)
    return out["choices"][0]["message"]["content"]

# ========= Main =========
def main():
    print("[OK] Mic → Whisper (partial/final) → LLM summary (when cache ≥100 chars). Ctrl+C to exit.")
    stream = start_stream()

    session_start = time.time()
    speaking = False
    last_voice_time = 0.0
    last_partial_time = 0.0
    last_partial_text = ""

    tail = np.zeros(int(OVERLAP_SEC * SAMPLE_RATE), dtype=np.int16)
    buf = []
    now = lambda: time.time()

    cache_text = ""  # 缓存用于总结

    try:
        while True:
            indata = audio_q.get()
            if indata is None:
                break

            if indata.ndim > 1:
                pcm16 = np.frombuffer(indata, dtype=np.int16).reshape(-1, CHANNELS)[:,0]
            else:
                pcm16 = np.frombuffer(indata, dtype=np.int16)

            voiced = is_speech_int16(pcm16)

            if voiced:
                if not speaking:
                    speaking = True
                last_voice_time = now()
                buf.append(pcm16)

                if now() - last_partial_time >= PARTIAL_INTERVAL:
                    chunk = np.concatenate([tail, *buf]) if buf else tail
                    wave = chunk.astype(np.float32) / 32768.0
                    text = transcribe_float32(wave)
                    if text and text != last_partial_text:
                        print("\r[partial] " + text, end="", flush=True)
                        last_partial_text = text
                    last_partial_time = now()

            else:
                if speaking and (now() - last_voice_time) * 1000 >= SILENCE_END_MS:
                    speaking = False
                    utter = np.concatenate([tail, *buf]) if buf else tail
                    wave = utter.astype(np.float32) / 32768.0
                    final_text = transcribe_float32(wave)
                    if final_text:
                        print("\r" + " " * 120, end="\r")
                        print("[final]  " + final_text, flush=True)
                        cache_text += " " + final_text

                        # 触发总结
                        if len(cache_text) >= 100:
                            llm = lazy_init_llm(
                                r"D:\Program Files\JetBrains\PyCharm 2025.2\Summary\llama.cpp\llama-3.1-8b-instruct-q4_K_M.gguf",
                                n_ctx=4096, n_gpu_layers=0
                            )
                            summary = summarize_text(llm, cache_text, bullets=5)
                            print("[summary]\n" + summary + "\n")
                            cache_text = ""

                    if utter.size >= tail.size:
                        tail = utter[-tail.size:].copy()
                    else:
                        z = np.zeros(tail.size - utter.size, dtype=np.int16)
                        tail = np.concatenate([z, utter])
                    buf.clear()
                    last_partial_text = ""
                    last_partial_time = now()

    except KeyboardInterrupt:
        pass
    finally:
        try:
            stream.stop(); stream.close()
        except Exception:
            pass
        print("\n[Bye]")

if __name__ == "__main__":
    main()
