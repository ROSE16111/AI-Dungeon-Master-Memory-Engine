import asyncio, websockets, json, queue, time, requests
import numpy as np
import webrtcvad
from faster_whisper import WhisperModel

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

print("[Init] Loading Whisper model …")
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
vad = webrtcvad.Vad(2)

audio_q: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=200)

# ========= Whisper helper =========
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

# ========= Ollama summarizer =========
def summarize_with_ollama(text: str, model: str = "phi3:medium") -> str:
    try:
        print(f"[Ollama] sending prompt (len={len(text)} chars)")
        resp = requests.post(
            "http://localhost:11434/api/generate",
            headers={"Content-Type": "application/json"},
            json={
                "model": model,
                "prompt": f"Summarize the following transcript into concise bullet points:\n\n{text}",
                "stream": False
            },
            timeout=120
        )
        print(f"[Ollama] HTTP status: {resp.status_code}")
        if resp.ok:
            data = resp.json()
            print(f"[Ollama] raw response: {data}")
            return data.get("response", "").strip()
        else:
            return f"[Error] Ollama HTTP {resp.status_code}"
    except Exception as e:
        print(f"[Ollama] error: {e}")
        return f"[Error] {e}"

# ========= WebSocket audio handler =========
async def audio_handler(websocket):
    print("[Client] connected")
    speaking = False
    last_voice_time = 0.0
    last_partial_time = 0.0
    last_partial_text = ""

    tail = np.zeros(int(OVERLAP_SEC * SAMPLE_RATE), dtype=np.int16)
    buf = []
    now = lambda: time.time()
    cache_text = ""   # 累计文本用于总结

    try:
        async for message in websocket:
            # print(f"[WS] received {len(message)} bytes")
            pcm16 = np.frombuffer(message, dtype=np.int16)
            voiced = is_speech_int16(pcm16)

            # ====== Partial ======
            if voiced:
                if not speaking:
                    speaking = True
                    print("[State] speaking started")
                last_voice_time = now()
                buf.append(pcm16)

                if now() - last_partial_time >= PARTIAL_INTERVAL:
                    chunk = np.concatenate([tail, *buf]) if buf else tail
                    wave = chunk.astype(np.float32) / 32768.0
                    try:
                        text = transcribe_float32(wave)
                        if text and text != last_partial_text:
                            print(f"[partial] {text}")
                            msg = {"partial": text}
                            print(f"[WS] sending {msg}")
                            await websocket.send(json.dumps(msg))
                            last_partial_text = text
                    except Exception as e:
                        print(f"[warn] partial failed: {e}")
                    last_partial_time = now()

            # ====== Final + Summary ======
            else:
                if speaking and (now() - last_voice_time) * 1000 >= SILENCE_END_MS:
                    speaking = False
                    utter = np.concatenate([tail, *buf]) if buf else tail
                    wave = utter.astype(np.float32) / 32768.0
                    try:
                        final_text = transcribe_float32(wave)
                        if final_text:
                            print(f"[final] {final_text}")
                            msg = {"final": final_text}
                            print(f"[WS] sending {msg}")
                            await websocket.send(json.dumps(msg))

                            cache_text += " " + final_text
                            print(f"[cache] len={len(cache_text)} chars, content={cache_text!r}")

                            # === Summarize when enough content ===
                            if len(cache_text) >= 30:   # 阈值可调
                                print("[summary] calling Ollama …")
                                summary = summarize_with_ollama(cache_text)
                                print(f"[summary]\n{summary}\n")
                                msg = {"summary": summary}
                                print(f"[WS] sending {msg}")
                                await websocket.send(json.dumps(msg))
                                cache_text = ""
                    except Exception as e:
                        print(f"[warn] final failed: {e}")

                    # maintain tail
                    if utter.size >= tail.size:
                        tail = utter[-tail.size:].copy()
                    else:
                        z = np.zeros(tail.size - utter.size, dtype=np.int16)
                        tail = np.concatenate([z, utter])
                    buf.clear()
                    last_partial_text = ""
                    last_partial_time = now()

    except websockets.exceptions.ConnectionClosed:
        print("[Client] disconnected")

# ========= Main =========
async def main():
    async with websockets.serve(audio_handler, "0.0.0.0", 8000):
        print("[Server] running on ws://0.0.0.0:8000/audio")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
