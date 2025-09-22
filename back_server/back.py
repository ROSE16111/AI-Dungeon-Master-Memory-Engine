import asyncio, websockets, json, queue, time
import numpy as np
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

print("[Init] Loading model …")
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
vad = webrtcvad.Vad(2)

audio_q: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=200)

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

async def audio_handler(websocket):
    print("[Client] connected")
    session_start = time.time()
    speaking = False
    last_voice_time = 0.0
    last_partial_time = 0.0
    last_partial_text = ""

    tail = np.zeros(int(OVERLAP_SEC * SAMPLE_RATE), dtype=np.int16)
    buf = []
    now = lambda: time.time()
    utt_start_wall = None

    try:
        async for message in websocket:
            pcm16 = np.frombuffer(message, dtype=np.int16)
            voiced = is_speech_int16(pcm16)

            if voiced:
                if not speaking:
                    speaking = True
                    utt_start_wall = now()
                last_voice_time = now()
                buf.append(pcm16)

                if now() - last_partial_time >= PARTIAL_INTERVAL:
                    chunk = np.concatenate([tail, *buf]) if buf else tail
                    wave = chunk.astype(np.float32) / 32768.0
                    try:
                        text = transcribe_float32(wave)
                        if text and text != last_partial_text:
                            await websocket.send(json.dumps({"partial": text}))
                            last_partial_text = text
                    except Exception as e:
                        print(f"[warn] partial failed: {e}")
                    last_partial_time = now()

            else:
                if speaking and (now() - last_voice_time) * 1000 >= SILENCE_END_MS:
                    speaking = False
                    utt_end_wall = now()
                    utter = np.concatenate([tail, *buf]) if buf else tail
                    wave = utter.astype(np.float32) / 32768.0
                    try:
                        final_text = transcribe_float32(wave)
                        if final_text:
                            await websocket.send(json.dumps({"final": final_text}))
                    except Exception as e:
                        print(f"[warn] final failed: {e}")

                    if utter.size >= tail.size:
                        tail = utter[-tail.size:].copy()
                    else:
                        z = np.zeros(tail.size - utter.size, dtype=np.int16)
                        tail = np.concatenate([z, utter])
                    buf.clear()
                    last_partial_text = ""
                    last_partial_time = now()
                    utt_start_wall = None

    except websockets.exceptions.ConnectionClosed:
        print("[Client] disconnected")

async def main():
    async with websockets.serve(audio_handler, "0.0.0.0", 5000):
        print("[Server] running on ws://0.0.0.0:5000/audio")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
