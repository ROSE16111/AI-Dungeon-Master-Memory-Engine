# server.py
import os, json, time, tempfile
from typing import List, Optional, Dict, Any, Union

import numpy as np
import requests
import chromadb
import webrtcvad
from faster_whisper import WhisperModel

from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# ---------- Settings ----------
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")

ACCEPTED_LANGS = {
    "af","am","ar","as","az","ba","be","bg","bn","bo","br","bs","ca","cs","cy","da","de","el",
    "en","es","et","eu","fa","fi","fo","fr","gl","gu","ha","haw","he","hi","hr","ht","hu","hy",
    "id","is","it","ja","jw","ka","kk","km","kn","ko","la","lb","ln","lo","lt","lv","mg","mi",
    "mk","ml","mn","mr","ms","mt","my","ne","nl","nn","no","oc","pa","pl","ps","pt","ro","ru",
    "sa","sd","si","sk","sl","sn","so","sq","sr","su","sv","sw","ta","te","tg","th","tk","tl",
    "tr","tt","uk","ur","uz","vi","yi","yo","zh","yue"
}

def normalize_lang(raw: str | None):
    """
    Map system locales like 'en_US.UTF-8' or 'en-AU' to 'en'.
    Return None to let Whisper auto-detect if not recognized.
    """
    if not raw:
        return None
    code = raw.strip().lower()
    # strip encoding and region
    code = code.split(".")[0]          # 'en_us'
    code = code.replace("-", "_")
    code = code.split("_")[0]          # 'en'
    return code if code in ACCEPTED_LANGS else None

SAMPLE_RATE = 16000
SILENCE_END_MS = 600
PARTIAL_INTERVAL = 0.9
OVERLAP_SEC = 0.2

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")
RAW_LANG = os.getenv("WHISPER_LANG") or os.getenv("LANG")
LANG = normalize_lang(RAW_LANG)
BEAM = int(os.getenv("BEAM", "1"))
TEMP = float(os.getenv("TEMP", "0.0"))

DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "docs")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")

# ---------- Shared models/clients ----------
print("[Init] Loading Whisper model…")
whisper = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
vad = webrtcvad.Vad(2)

class OllamaEmbeddingFunction:
    def __init__(self, base_url: str = OLLAMA_URL, model: str = EMBED_MODEL, timeout: int = 60):
        self.base_url, self.model, self.timeout = base_url.rstrip("/"), model, timeout
    def name(self) -> str:  # helps Chroma persist EF identity
        return f"ollama::{self.model}"
    def __call__(self, input: list[str]) -> list[list[float]]:
        texts = [input] if isinstance(input, str) else input
        out: list[list[float]] = []
        for t in texts:
            r = requests.post(f"{self.base_url}/api/embeddings", json={"model": self.model, "prompt": t}, timeout=self.timeout)
            r.raise_for_status()
            out.append(r.json()["embedding"])
        return out

chroma = chromadb.PersistentClient(path=DB_PATH)
ef = OllamaEmbeddingFunction()
collection = chroma.get_or_create_collection(name=COLLECTION_NAME, embedding_function=ef)

# ---------- FastAPI ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# ---------- Helpers ----------
def is_speech_int16(pcm16: np.ndarray) -> bool:
    try:
        return vad.is_speech(pcm16.tobytes(), SAMPLE_RATE)
    except Exception:
        return False

def transcribe_float32(wave_f32: np.ndarray) -> str:
    segs, _ = whisper.transcribe(
        wave_f32,
        language=LANG,   # <-- passes 'en' or None (auto)
        beam_size=BEAM,
        temperature=TEMP,
        vad_filter=False,
        no_speech_threshold=0.4,
        compression_ratio_threshold=2.4,
    )
    return "".join(s.text for s in segs).strip()

# Allowed primitive types for Chroma metadata
AllowedMeta = Union[str, int, float, bool]

def clean_metadata(meta: dict | None) -> dict[str, AllowedMeta]:
    out: dict[str, AllowedMeta] = {}
    if not meta:
        return out
    for k, v in meta.items():
        if v is None:
            continue
        if isinstance(v, (str, int, float, bool)):
            out[k] = v
        else:
            out[k] = str(v)  # force non-primitives to string
    return out

# ---------- REST: file upload STT ----------
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    tmp_path = None
    try:
        suffix = os.path.splitext(file.filename or "")[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        segs, _ = whisper.transcribe(
            tmp_path,
            language=LANG,   # <-- same here
            beam_size=BEAM,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
        )
        text = " ".join(s.text for s in segs).strip()
        return {"text": text}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if tmp_path:
            try: os.remove(tmp_path)
            except Exception: pass

# ---------- WebSocket: streaming STT ----------
async def handle_audio_ws(websocket: WebSocket):
    print("[WS] connected")
    # optional hello so UI wiring is obvious
    try:
        await websocket.send_text(json.dumps({"partial": "[listening…]"}))
    except Exception:
        pass

    speaking = False
    last_voice = 0.0
    last_partial_t = 0.0
    last_partial_text = ""
    tail = np.zeros(int(OVERLAP_SEC * SAMPLE_RATE), dtype=np.int16)
    buf: list[np.ndarray] = []
    now = lambda: time.time()
    frame_count = 0

    try:
        while True:
            message = await websocket.receive_bytes()
            frame_count += 1
            if frame_count % 50 == 0:
                print(f"[WS] received {frame_count} frames")

            pcm16 = np.frombuffer(message, dtype=np.int16)
            if is_speech_int16(pcm16):
                if not speaking:
                    speaking = True
                last_voice = now()
                buf.append(pcm16)

                if now() - last_partial_t >= PARTIAL_INTERVAL:
                    chunk = np.concatenate([tail, *buf]) if buf else tail
                    wave = chunk.astype(np.float32) / 32768.0
                    try:
                        text = transcribe_float32(wave)
                        if text and text != last_partial_text:
                            await websocket.send_text(json.dumps({"partial": text}))
                            last_partial_text = text
                    except Exception as e:
                        print(f"[WS] partial failed: {e}")
                    last_partial_t = now()
            else:
                if speaking and (now() - last_voice) * 1000 >= SILENCE_END_MS:
                    speaking = False
                    utter = np.concatenate([tail, *buf]) if buf else tail
                    wave = utter.astype(np.float32) / 32768.0
                    try:
                        final_text = transcribe_float32(wave)
                        if final_text:
                            await websocket.send_text(json.dumps({"final": final_text}))
                    except Exception as e:
                        print(f"[WS] final failed: {e}")

                    # roll tail
                    if utter.size >= tail.size:
                        tail = utter[-tail.size:].copy()
                    else:
                        z = np.zeros(tail.size - utter.size, dtype=np.int16)
                        tail = np.concatenate([z, utter])
                    buf.clear()
                    last_partial_text = ""
                    last_partial_t = now()
    except WebSocketDisconnect:
        print("[WS] disconnected")
        return
    except Exception as e:
        print("[WS] error:", e)
        return

# Preferred route
@app.websocket("/ws/audio")
async def ws_audio(websocket: WebSocket):
    await websocket.accept()
    await handle_audio_ws(websocket)

# Legacy alias so existing clients using "/audio" still work
@app.websocket("/audio")
async def ws_audio_legacy(websocket: WebSocket):
    await websocket.accept()
    await handle_audio_ws(websocket)

# ---------- RAG: health / ingest / query ----------
class IngestItem(BaseModel):
    id: str
    text: str
    metadata: Optional[Dict[str, Any]] = None  # cleaned before insert

class IngestRequest(BaseModel):
    items: List[IngestItem]

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    where: Optional[Dict[str, Any]] = None

@app.get("/healthz")
def healthz():
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        ok = r.status_code == 200
    except Exception:
        ok = False
    return {"status": "ok", "collection": COLLECTION_NAME, "ollama": "up" if ok else "unreachable", "embed_model": EMBED_MODEL}

@app.post("/ingest")
def ingest(req: IngestRequest):
    ids = [str(i.id) for i in req.items]
    docs = [i.text for i in req.items]
    metas = [clean_metadata(i.metadata) for i in req.items]

    if not (len(ids) == len(docs) == len(metas)):
        raise HTTPException(status_code=400, detail="ids/docs/metadatas length mismatch")

    collection.add(ids=ids, documents=docs, metadatas=metas)
    return {"ok": True, "count": len(ids)}

@app.post("/query")
def query(req: QueryRequest):
    res = collection.query(query_texts=[req.query], n_results=req.top_k, where=req.where)
    items = []
    # distances may be absent depending on config
    dists = res.get("distances", [[None]])[0] if "distances" in res else [None] * len(res["ids"][0])
    for i in range(len(res["ids"][0])):
        items.append({
            "id": res["ids"][0][i],
            "text": res["documents"][0][i],
            "metadata": res["metadatas"][0][i],
            "distance": dists[i],
        })
    return {"results": items}

# ---------- Entrypoint ----------
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
