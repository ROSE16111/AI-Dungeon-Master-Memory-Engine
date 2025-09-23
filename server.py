import os, re, json, time, tempfile, shutil
from typing import List, Optional, Dict, Any, Union
from contextlib import asynccontextmanager

import numpy as np
import requests
import chromadb
from chromadb.config import Settings
from chromadb import errors as ce
import webrtcvad
from faster_whisper import WhisperModel

from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# =====================================================================
# SETTINGS & GLOBAL CONFIG
# =====================================================================
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")

SAMPLE_RATE = 16000
SILENCE_END_MS = 600
PARTIAL_INTERVAL = 0.9
OVERLAP_SEC = 0.2

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")
LANG = os.getenv("ASR_LANG", "en")

BEAM = int(os.getenv("BEAM", "1"))
TEMP = float(os.getenv("TEMP", "0.0"))

DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "docs")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")

# LLM / summarization
OLLAMA_SUMMARY_MODEL = os.getenv("OLLAMA_SUMMARY_MODEL", "phi3:medium")
SUMMARY_THRESHOLD_CHARS = int(os.getenv("SUMMARY_THRESHOLD_CHARS", "30"))
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))

# Retrieval trimming
MAX_DOCS = int(os.getenv("MAX_DOCS", "3"))
MAX_CHARS_PER_DOC = int(os.getenv("MAX_CHARS_PER_DOC", "800"))

# Answer-length control
STOP_SENTINEL = os.getenv("STOP_SENTINEL", "<END>")
MAX_PREDICT = int(os.getenv("MAX_PREDICT", "96"))

# Optional: bypass LLM and echo first snippet for debugging
ANSWER_ECHO_ONLY = os.getenv("ANSWER_ECHO_ONLY", "0") == "1"

# =====================================================================
# SHARED CLIENTS (Whisper, VAD)
# =====================================================================
print("[Init] Loading Whisper model…")
whisper = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
vad = webrtcvad.Vad(2)

# =====================================================================
# EMBEDDING FUNCTION (Ollama)
# =====================================================================
AllowedMeta = Union[str, int, float, bool]

class OllamaEmbeddingFunction:
    def __init__(self, base_url: str = OLLAMA_URL, model: str = EMBED_MODEL, timeout: int = 60):
        self.base_url, self.model, self.timeout = base_url.rstrip("/"), model, timeout

    def name(self) -> str:
        return f"ollama::{self.model}"

    # IMPORTANT: Chroma expects the param to be named **input**
    def __call__(self, input: List[str]) -> List[List[float]]:
        # Coerce to list if a single string was passed
        texts = [input] if isinstance(input, str) else input
        out: List[List[float]] = []
        for t in texts:
            r = requests.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model, "prompt": t},
                timeout=self.timeout,
            )
            r.raise_for_status()
            data = r.json()
            emb = data.get("embedding")
            if not emb:
                raise RuntimeError(f"Missing embedding from Ollama for text len={len(t)}")
            out.append(emb)
        return out

ef = OllamaEmbeddingFunction()

# =====================================================================
# CHROMA BOOTSTRAP (auto-create & self-heal)
# =====================================================================
chroma = None
collection = None

def init_chroma():
    """(Re)initialise Chroma client+collection; create path if missing."""
    global chroma, collection
    os.makedirs(DB_PATH, exist_ok=True)
    chroma = chromadb.PersistentClient(
        path=DB_PATH,
        settings=Settings(anonymized_telemetry=False),
    )
    collection = chroma.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=ef,
    )
    print(f"[Chroma] ready at {DB_PATH}, collection={COLLECTION_NAME}")

def ensure_collection():
    """Ping collection; if missing or broken, re-init on the fly."""
    global collection
    try:
        _ = collection.count()
    except Exception as e:
        print(f"[Chroma] ensure failed ({type(e).__name__}): {e} — reinit")
        init_chroma()

init_chroma()

# =====================================================================
# APP LIFESPAN (Warm models)
# =====================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        # Warm LLM
        requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/generate",
            headers={"Content-Type": "application/json"},
            json={"model": OLLAMA_SUMMARY_MODEL, "prompt": "ok", "stream": False, "keep_alive": "1h"},
            timeout=10,
        )
        # Warm embedding model
        requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/embeddings",
            headers={"Content-Type": "application/json"},
            json={"model": EMBED_MODEL, "prompt": "warmup"},
            timeout=10,
        )
        print("[Warmup] Ollama models loaded")
    except Exception as e:
        print("[Warmup] skipped:", e)
    yield

# =====================================================================
# FASTAPI APP & MIDDLEWARE
# =====================================================================
app = FastAPI(lifespan=lifespan)

allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,   # use explicit origins in prod (comma-separated)
    allow_credentials=False,         # keep False with "*" to avoid browser rejection
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
# UTILITIES
# =====================================================================
def focus_term(q: str) -> Optional[str]:
    """Extract main subject from 'who is X' or longest Capitalized token."""
    ql = q.lower().strip()
    m = re.search(r"\bwho\s+is\s+([a-z0-9' -]+)\b", ql)
    if m:
        return m.group(1).strip()
    caps = re.findall(r"\b[A-Z][a-zA-Z'-]{2,}\b", q)
    return max(caps, key=len).lower() if caps else None

def first_n_sentences(t: str, n: int = 2) -> str:
    parts = re.split(r'(?<=[.!?])\s+', t.strip())
    return ' '.join(parts[:n]).strip()

def trim_text(s: str, n: int) -> str:
    s = s or ""
    return s if len(s) <= n else s[:n] + "…"

def chunk_text(text: str,
               max_chars: int = int(os.getenv("CHUNK_CHARS", "1200")),
               overlap: int   = int(os.getenv("CHUNK_OVERLAP", "150"))) -> List[str]:
    sents = re.split(r'(?<=[.!?])\s+', (text or "").strip())
    chunks, cur = [], ""
    for s in sents:
        if len(cur) + len(s) + 1 <= max_chars:
            cur = (cur + " " + s).strip()
        else:
            if cur:
                chunks.append(cur)
            tail = cur[-overlap:] if overlap and len(cur) > overlap else ""
            cur = (tail + " " + s).strip()
    if cur:
        chunks.append(cur)
    return chunks

def clean_metadata(meta: dict | None) -> Dict[str, AllowedMeta]:
    out: Dict[str, AllowedMeta] = {}
    if not meta:
        return out
    for k, v in meta.items():
        if v is None:
            continue
        out[k] = v if isinstance(v, (str, int, float, bool)) else str(v)
    return out

def is_speech_int16(pcm16: np.ndarray) -> bool:
    try:
        return vad.is_speech(pcm16.tobytes(), SAMPLE_RATE)
    except Exception:
        return False

def transcribe_float32(wave_f32: np.ndarray) -> str:
    segs, _ = whisper.transcribe(
        wave_f32,
        language=LANG,
        beam_size=BEAM,
        temperature=TEMP,
        vad_filter=False,
        no_speech_threshold=0.4,
        compression_ratio_threshold=2.4,
    )
    return "".join(s.text for s in segs).strip()

def summarize_with_ollama(text: str, model: str = OLLAMA_SUMMARY_MODEL) -> str:
    try:
        resp = requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/generate",
            headers={"Content-Type": "application/json"},
            json={
                "model": model,
                "prompt": f"Summarize the following transcript into concise bullet points:\n\n{text}",
                "stream": False,
                "keep_alive": "1h",
            },
            timeout=OLLAMA_TIMEOUT,
        )
        if resp.ok:
            data = resp.json()
            return (data.get("response") or "").strip()
        return f"[Error] Ollama HTTP {resp.status_code}"
    except Exception as e:
        return f"[Error] {e}"

# =====================================================================
# MODELS
# =====================================================================
class IngestTranscriptRequest(BaseModel):
    id_prefix: str
    text: str
    metadata: Optional[Dict[str, Any]] = None

class IngestItem(BaseModel):
    id: str
    text: str
    metadata: Optional[Dict[str, Any]] = None

class IngestRequest(BaseModel):
    items: List[IngestItem]

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    where: Optional[Dict[str, Any]] = None

class AnswerRequest(BaseModel):
    question: str
    top_k: int = 5
    where: Optional[Dict[str, Any]] = None

# =====================================================================
# HEALTH
# =====================================================================
@app.get("/health")
def health():
    ensure_collection()
    return {
        "ok": True,
        "models": {"whisper": WHISPER_MODEL, "embed": EMBED_MODEL, "gen": OLLAMA_SUMMARY_MODEL},
        "db": {"path": DB_PATH, "collection": COLLECTION_NAME, "count": collection.count()},
    }

# =====================================================================
# ADMIN (reset/clear)
# =====================================================================
@app.post("/admin/clear_collection")
def admin_clear_collection():
    ensure_collection()
    try:
        collection.delete(where={})
        return {"ok": True, "cleared": True}
    except Exception as e:
        raise HTTPException(500, f"clear failed: {e}")

@app.post("/admin/reset_disk")
def admin_reset_disk():
    try:
        if os.path.isdir(DB_PATH):
            shutil.rmtree(DB_PATH)
        init_chroma()
        return {"ok": True, "recreated": True, "path": DB_PATH}
    except Exception as e:
        raise HTTPException(500, f"reset_disk failed: {e}")

# =====================================================================
# RAG: TRANSCRIPT INGEST (server-side chunking)
# =====================================================================
@app.post("/ingest_transcript")
def ingest_transcript(req: IngestTranscriptRequest):
    ensure_collection()
    chunks = chunk_text(req.text)
    if not chunks:
        raise HTTPException(status_code=400, detail="empty transcript")

    base_meta = clean_metadata(req.metadata)
    base_meta["type"] = "raw"

    ids   = [f"{req.id_prefix}_{i:04d}" for i in range(len(chunks))]
    docs  = chunks
    metas = [{**base_meta, "chunk_index": i} for i in range(len(chunks))]

    collection.add(ids=ids, documents=docs, metadatas=metas)
    return {"ok": True, "count": len(ids)}

# =====================================================================
# RAG: GENERIC INGEST & QUERY
# =====================================================================
@app.post("/ingest")
def ingest(req: IngestRequest):
    ensure_collection()
    ids = [str(i.id) for i in req.items]
    docs = [i.text for i in req.items]
    metas = [clean_metadata(i.metadata) for i in req.items]
    if not (len(ids) == len(docs) == len(metas)):
        raise HTTPException(status_code=400, detail="ids/docs/metadatas length mismatch")
    collection.add(ids=ids, documents=docs, metadatas=metas)
    return {"ok": True, "count": len(ids)}

@app.post("/query")
def query(req: QueryRequest):
    ensure_collection()
    res = collection.query(
        query_texts=[req.query],
        n_results=req.top_k,
        where=req.where,
        include=["documents", "metadatas", "distances"],
    )
    ids = res.get("ids", [[]])[0]
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]

    items = []
    for i in range(len(ids)):
        items.append({
            "id": ids[i],
            "text": docs[i],
            "metadata": metas[i],
            "distance": dists[i] if i < len(dists) else None,
        })
    return {"results": items}

# =====================================================================
# RAG: ANSWER (uses retrieved context)
# =====================================================================
@app.post("/answer")
def answer(req: AnswerRequest):
    ensure_collection()
    effective_where = req.where if (req.where and len(req.where)) else {"type": "raw"}

    res = collection.query(
        query_texts=[req.question],
        n_results=req.top_k,
        where=effective_where,
        include=["documents", "metadatas", "distances"],
    )

    ids   = res.get("ids", [[]])[0]
    docs  = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]

    # No retrieval → early JSON fallback
    if not ids:
        return {"answer": "I don’t know based on the current knowledge.", "used": []}

    metas = [(m or {}) if isinstance(m, dict) else {} for m in metas]

    # Optional focus-term re-rank
    term = focus_term(req.question)
    if term:
        def score(d: str) -> int:
            return (d or "").lower().count(term)
        scored = [(i, d, m, score(d)) for i, d, m in zip(ids, docs, metas)]
        filtered = [t for t in scored if t[3] > 0]
        chosen = filtered if filtered else scored
        if chosen:
            chosen.sort(key=lambda t: t[3], reverse=True)
            ids, docs, metas = zip(*[(c[0], c[1], c[2]) for c in chosen])
            ids, docs, metas = list(ids), list(docs), list(metas)

    # Trim count and per-doc length
    ids, docs, metas = ids[:MAX_DOCS], docs[:MAX_DOCS], metas[:MAX_DOCS]

    # Build short context
    ctx_lines = []
    for i, (d, m, id_) in enumerate(zip(docs, metas, ids), start=1):
        tag = (m or {}).get("type")
        ctx_lines.append(f"[{i}] id={id_} type={tag}\n{trim_text(d, MAX_CHARS_PER_DOC)}")
    context = "\n\n".join(ctx_lines)

    # Debug path: skip LLM
    if ANSWER_ECHO_ONLY:
        snippet = trim_text(docs[0] if docs else "", 200)
        used = [{"id": ids[0], "text": docs[0], "metadata": metas[0]}] if ids else []
        return {"answer": snippet or "I don’t know based on the current knowledge.", "used": used}

    prompt = (
        "Answer ONLY about the specific subject asked.\n"
        "Use ONLY the provided context; if it doesn't contain the answer, say you don't know.\n"
        "Do not include citations, bracketed numbers, or source IDs.\n"
        f"Question: {req.question}\n\n"
        f"Context:\n{context}\n\n"
        f"Give a concise answer in at most 2 short sentences. End with {STOP_SENTINEL}:"
    )

    try:
        r = requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/generate",
            headers={"Content-Type": "application/json"},
            json={
                "model": OLLAMA_SUMMARY_MODEL,
                "prompt": prompt,
                "stream": False,
                "keep_alive": "1h",
                "options": {
                    "num_predict": MAX_PREDICT,
                    "temperature": 0.2,
                    "top_p": 0.9,
                    "repeat_penalty": 1.1,
                    "num_thread": os.cpu_count() or 4,
                },
                "stop": [STOP_SENTINEL],
            },
            timeout=OLLAMA_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        answer_text = (data.get("response") or "").strip()
        answer_text = answer_text.split(STOP_SENTINEL, 1)[0].strip()
        answer_text = first_n_sentences(answer_text, 2)
        answer_text = re.sub(r'\s*\[\d+\]', '', answer_text)
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Ollama HTTP error: {e}")
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"Ollama returned non-JSON: {e}")

    used = [{"id": id_, "text": d, "metadata": m} for id_, d, m in zip(ids, docs, metas)]
    return {"answer": answer_text, "used": used}

# =====================================================================
# RECORDING / STT: WS STREAMING + FILE UPLOAD
# =====================================================================
async def handle_audio_ws(websocket: WebSocket):
    print("[WS] connected")
    try:
        await websocket.send_text(json.dumps({"partial": "[listening…]"}))
    except Exception:
        pass

    speaking = False
    last_voice = 0.0
    last_partial_t = 0.0
    last_partial_text = ""
    tail = np.zeros(int(OVERLAP_SEC * SAMPLE_RATE), dtype=np.int16)
    buf: List[np.ndarray] = []
    now = lambda: time.time()
    cache_text = ""

    try:
        while True:
            message = await websocket.receive_bytes()

            pcm16 = np.frombuffer(message, dtype=np.int16)
            if is_speech_int16(pcm16):
                if not speaking:
                    speaking = True
                    print("[State] speaking started")
                last_voice = now()
                buf.append(pcm16)

                if now() - last_partial_t >= PARTIAL_INTERVAL:
                    chunk = np.concatenate([tail, *buf]) if buf else tail
                    wave = chunk.astype(np.float32) / 32768.0
                    try:
                        text = transcribe_float32(wave)
                        if text and text != last_partial_text:
                            print(f"[partial] {text}")
                            await websocket.send_text(json.dumps({"partial": text}))
                            last_partial_text = text
                    except Exception as e:
                        print(f"[WS] partial failed:", e)
                    last_partial_t = now()
            else:
                if speaking and (now() - last_voice) * 1000 >= SILENCE_END_MS:
                    speaking = False
                    utter = np.concatenate([tail, *buf]) if buf else tail
                    wave = utter.astype(np.float32) / 32768.0
                    try:
                        final_text = transcribe_float32(wave)
                        if final_text:
                            print(f"[final] {final_text}")
                            await websocket.send_text(json.dumps({"final": final_text}))

                            cache_text += (" " if cache_text else "") + final_text
                            print(f"[cache] len={len(cache_text)}")
                            if len(cache_text) >= SUMMARY_THRESHOLD_CHARS:
                                print("[summary] calling Ollama …")
                                summary = summarize_with_ollama(cache_text)
                                print(f"[summary]\n{summary}\n")
                                await websocket.send_text(json.dumps({"summary": summary}))
                                cache_text = ""
                    except Exception as e:
                        print(f"[WS] final failed:", e)

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

@app.websocket("/ws/audio")
async def ws_audio(websocket: WebSocket):
    await websocket.accept()
    await handle_audio_ws(websocket)

@app.websocket("/audio")  # legacy alias
async def ws_audio_legacy(websocket: WebSocket):
    await websocket.accept()
    await handle_audio_ws(websocket)

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
            language=LANG,
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

# =====================================================================
# ENTRYPOINT
# =====================================================================
if __name__ == "__main__":
    # Ensure DB path exists at boot
    os.makedirs(DB_PATH, exist_ok=True)
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
