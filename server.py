import os
import re
import json
import time
import tempfile
import shutil
import contextlib
import asyncio
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any, Union, Callable

import numpy as np
import requests
import chromadb
from chromadb.config import Settings
import webrtcvad
from faster_whisper import WhisperModel
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from starlette.websockets import WebSocketState

# =====================================================================
# SETTINGS
# =====================================================================
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")

SAMPLE_RATE = 16000
SILENCE_END_MS = 800
PARTIAL_INTERVAL = 0.9
OVERLAP_SEC = 0.2

SUMMARY_CHUNK_CHARS = int(os.getenv("SUMMARY_CHUNK_CHARS", "240"))

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")
LANG = os.getenv("ASR_LANG", "en")
BEAM = int(os.getenv("BEAM", "1"))
TEMP = 0.0

DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "docs")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")

OLLAMA_SUMMARY_MODEL = os.getenv("OLLAMA_SUMMARY_MODEL", "phi3:medium")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))

MAX_DOCS = int(os.getenv("MAX_DOCS", "3"))
MAX_CHARS_PER_DOC = int(os.getenv("MAX_CHARS_PER_DOC", "800"))

STOP_SENTINEL = os.getenv("STOP_SENTINEL", "<END>")
MAX_PREDICT = int(os.getenv("MAX_PREDICT", "96"))
ANSWER_ECHO_ONLY = os.getenv("ANSWER_ECHO_ONLY", "0") == "1"
MAX_UTTER_SEC = float(os.getenv("MAX_UTTER_SEC", "12.0"))

SUMMARY_MIN_FLUSH_CHARS = int(os.getenv("SUMMARY_MIN_FLUSH_CHARS", "80"))
SUMMARY_FORCE_FLUSH_AFTER_FINAL = os.getenv("SUMMARY_FORCE_FLUSH_AFTER_FINAL", "1") == "1"
SUMMARY_DRAIN_TIMEOUT = float(os.getenv("SUMMARY_DRAIN_TIMEOUT", "5.0"))
SESSION_IDLE_SEC = float(os.getenv("SESSION_IDLE_SEC", "8.0"))

# last_upsert_t = 0.0
# UPSERT_COOLDOWN = float(os.getenv("UPSERT_COOLDOWN", "10.0"))

# MAX_UPSERT_CHARS = int(os.getenv("MAX_UPSERT_CHARS", "800"))
# CHAR_UPSERT_CONNECT_TIMEOUT = float(os.getenv("CHAR_UPSERT_CONNECT_TIMEOUT", "2"))
# CHAR_UPSERT_READ_TIMEOUT = float(os.getenv("CHAR_UPSERT_READ_TIMEOUT", "180"))

# =====================================================================
# SHARED CLIENTS (Whisper, VAD)
# =====================================================================
print("[Init] Loading Whisper model…")
whisper = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
vad = webrtcvad.Vad(2)

# =====================================================================
# EMBEDDINGS (Ollama) — tolerant to Chroma EF API changes
# =====================================================================
AllowedMeta = Union[str, int, float, bool]

class OllamaEmbeddingFunction:
    def __init__(self, base_url: str = OLLAMA_URL, model: str = EMBED_MODEL, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
    def __call__(self, input: List[str]) -> List[List[float]]:
        texts = [input] if isinstance(input, str) else input
        return self._embed(texts)
    def name(self) -> str:
        return f"ollama::{self.model}"
    def embed_documents(self, input: List[str], **kwargs) -> List[List[float]]:
        texts = [input] if isinstance(input, str) else input
        return self._embed(texts)
    def embed_query(self, input: Union[str, List[str]], **kwargs) -> List[List[float]]:
        text = input[0] if isinstance(input, list) else input
        return self._embed([text])
    def _embed(self, texts: List[str]) -> List[List[float]]:
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

def embed_query_batched(text: str) -> List[List[float]]:
    try:
        vec = ef.embed_query(input=text)
    except TypeError:
        try:
            vec = ef.embed_query(text)
        except Exception:
            try:
                vec = ef([text])
            except Exception:
                r = requests.post(
                    f"{OLLAMA_URL.rstrip('/')}/api/embeddings",
                    json={"model": EMBED_MODEL, "prompt": text},
                    timeout=OLLAMA_TIMEOUT,
                )
                r.raise_for_status()
                emb = r.json().get("embedding")
                vec = [emb] if emb else None
    if vec is None:
        raise RuntimeError("Failed to obtain query embedding.")
    if isinstance(vec, list) and vec and isinstance(vec[0], float):
        return [vec]
    if isinstance(vec, list) and vec and isinstance(vec[0], list):
        return vec
    raise RuntimeError(f"Unexpected embedding shape from EF: {type(vec)}")

# =====================================================================
# CHROMA
# =====================================================================
chroma = None
collection = None

def init_chroma():
    global chroma, collection
    os.makedirs(DB_PATH, exist_ok=True)
    chroma = chromadb.PersistentClient(path=DB_PATH, settings=Settings(anonymized_telemetry=False))
    collection = chroma.get_or_create_collection(name=COLLECTION_NAME, embedding_function=ef)
    print(f"[Chroma] ready at {DB_PATH}, collection={COLLECTION_NAME}")

def ensure_collection():
    global collection
    try:
        _ = collection.count()
    except Exception as e:
        print(f"[Chroma] ensure failed ({type(e).__name__}): {e} — reinit")
        init_chroma()

init_chroma()

# =====================================================================
# APP + LIFESPAN
# =====================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/generate",
            headers={"Content-Type": "application/json"},
            json={"model": OLLAMA_SUMMARY_MODEL, "prompt": "ok", "stream": False, "keep_alive": "1h"},
            timeout=50,
        )
        requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/embeddings",
            headers={"Content-Type": "application/json"},
            json={"model": EMBED_MODEL, "prompt": "warmup"},
            timeout=50,
        )
        print("[Warmup] Ollama models loaded")
    except Exception as e:
        print("[Warmup] skipped:", e)
    yield

app = FastAPI(lifespan=lifespan)
allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

# =====================================================================
# UTILS
# =====================================================================
def focus_term(q: str) -> Optional[str]:
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

def chunk_text(text: str, max_chars: int = int(os.getenv("CHUNK_CHARS", "800")), overlap: int = int(os.getenv("CHUNK_OVERLAP", "30"))) -> List[str]:
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
    print(f"\n[Summary] Calling Ollama with {len(text.split())} words")
    print(f"[Summary] Input preview: {text[:150]}...\n")

    prompt = (
        "You are a STRICT extractor for tabletop role-playing game (TTRPG) session notes.\n"
        "TASK:\n"
        "1) Summarize ONLY in-game narrative and mechanics (characters, locations, actions, events, items, checks, combat, outcomes).\n"
        "2) IGNORE all table chat / out-of-character (OOC) chatter: jokes, small talk, rules discussion, logistics, meta-commentary.\n"
        "3) DO NOT invent names, places, items, or facts not present in the transcript.\n"
        "4) If the chunk contains ONLY table chat or no game content, output exactly: SKIP and not the following output rules.\n"
        "5) Output:\n"
        "   - First line: the title only (3 -5 words, no prefix).\n"
        "   - Next 2–5 sentences: strictly derived from the chunk.\n"
        "   - Nothing else.\n\n"
        f"Transcript chunk:\n{text}\n"
    )

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "1h",
        "options": {"temperature": 0.0},
    }

    max_retries = int(os.getenv("SUMMARY_MAX_RETRIES", "2"))
    backoff_base = float(os.getenv("SUMMARY_BACKOFF_BASE", "0.75"))
    connect_timeout = float(os.getenv("SUMMARY_CONNECT_TIMEOUT", "5"))
    read_timeout = float(os.getenv("SUMMARY_READ_TIMEOUT", str(OLLAMA_TIMEOUT)))

    for attempt in range(max_retries + 1):
        try:
            resp = requests.post(
                f"{OLLAMA_URL.rstrip('/')}/api/generate",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=(connect_timeout, read_timeout),
            )
            resp.raise_for_status()
            data = resp.json()
            out = (data.get("response") or "").strip()
            print(f"[Summary] Ollama response:\n{out}\n{'-'*50}")
            return out
        except requests.exceptions.Timeout:
            if attempt < max_retries:
                sleep_s = backoff_base * (2 ** attempt)
                print(f"[Summary][retry] Timeout, retrying in {sleep_s:.2f}s (attempt {attempt+1}/{max_retries})")
                time.sleep(sleep_s)
                continue
            return "[Error] Timeout contacting Ollama"
        except requests.exceptions.RequestException as e:
            if attempt < max_retries and isinstance(e, requests.exceptions.ConnectionError):
                sleep_s = backoff_base * (2 ** attempt)
                print(f"[Summary][retry] Connection error, retrying in {sleep_s:.2f}s (attempt {attempt+1}/{max_retries}): {e}")
                time.sleep(sleep_s)
                continue
            return f"[Error] {e}"

async def summarize_async(text: str) -> str:
    return await asyncio.to_thread(summarize_with_ollama, text)

class RollingSummarizer:
    def __init__(self, threshold_chars: int = SUMMARY_CHUNK_CHARS, fn: Optional[Callable[[str], str]] = None, cooldown_sec: float = 0.0, min_chunk_chars: int = 120):
        self.threshold = max(1, int(threshold_chars))
        self.min_chunk = max(1, int(min_chunk_chars))
        self.fn = fn or (lambda s: s)
        self.cooldown_sec = cooldown_sec
        self._buf: list[str] = []
        self._carry: str = ""
        self._last_t = 0.0

    def _split_on_sentence(self, s: str, hard_len: int) -> int:
        if len(s) < hard_len:
            return 0
        chunk = s[:hard_len]
        tail = chunk[-40:]
        for p in ("。", "！", "？", ".", "!", "?"):
            i = tail.rfind(p)
            if i != -1:
                return (hard_len - len(tail)) + i + 1
        return hard_len

    def push(self, text: str) -> list[str]:
        self._buf.append(text or "")
        s = self._carry + "".join(self._buf)
        self._buf.clear()
        out: list[str] = []

        import time as _t
        if self.cooldown_sec and (_t.time() - self._last_t) < self.cooldown_sec and len(s) < self.threshold:
            return out

        print(f"[Rolling] Current buffer len={len(s)}, threshold={self.threshold}")
        while len(s) >= self.threshold:
            cut = self._split_on_sentence(s, self.threshold)
            chunk, s = s[:cut], s[cut:]
            if len(chunk) < self.min_chunk:
                self._carry = chunk + s
                s = ""
                break
            try:
                seg = (self.fn(chunk) or "").strip()
                print(f"[Rolling] Segment prepared, len={len(chunk)} chars")
                if seg:
                    out.append(seg)
            except Exception as e:
                out.append(f"[Error summarizing chunk] {e}")
            print(f"[Rolling] Current buffer len={len(s)}, threshold={self.threshold}")

        self._carry = s if len(s) < self.min_chunk else ""
        if self._carry == "" and s:
            try:
                seg = (self.fn(s) or "").strip()
                if seg:
                    out.append(seg)
                else:
                    self._carry = s
            except Exception:
                self._carry = s

        self._last_t = _t.time()
        return out

    def flush(self) -> str:
        s = (self._carry + "".join(self._buf)).strip()
        self._carry, self._buf = "", []
        if not s:
            return ""
        try:
            return (self.fn(s) or "").strip()
        except Exception as e:
            return f"[Error summarizing tail] {e}"

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
# ROUTES: HEALTH / ADMIN
# =====================================================================
@app.get("/health")
def health():
    ensure_collection()
    return {"ok": True, "models": {"whisper": WHISPER_MODEL, "embed": EMBED_MODEL, "gen": OLLAMA_SUMMARY_MODEL}, "db": {"path": DB_PATH, "collection": COLLECTION_NAME, "count": collection.count()}}

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
# RAG: INGEST / QUERY / ANSWER
# =====================================================================
@app.post("/ingest_transcript")
def ingest_transcript(req: IngestTranscriptRequest):
    ensure_collection()
    chunks = chunk_text(req.text)
    if not chunks:
        raise HTTPException(status_code=400, detail="empty transcript")
    base_meta = clean_metadata(req.metadata)
    base_meta["type"] = "raw"
    ids = [f"{req.id_prefix}_{i:04d}" for i in range(len(chunks))]
    docs = chunks
    metas = [{**base_meta, "chunk_index": i} for i in range(len(chunks))]
    collection.add(ids=ids, documents=docs, metadatas=metas)
    return {"ok": True, "count": len(ids)}

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
    try:
        qbatch = embed_query_batched(req.query)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Query embedding failed: {e}")
    res = collection.query(query_embeddings=qbatch, n_results=req.top_k, where=req.where, include=["documents", "metadatas", "distances"])
    ids = res.get("ids", [[]])[0]
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    items = []
    for i in range(len(ids)):
        items.append({"id": ids[i], "text": docs[i], "metadata": metas[i], "distance": dists[i] if i < len(dists) else None})
    return {"results": items}

@app.post("/answer")
def answer(req: AnswerRequest):
    ensure_collection()
    effective_where = req.where if (req.where and len(req.where)) else {"type": "raw"}
    try:
        qbatch = embed_query_batched(req.question)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Query embedding failed: {e}")
    res = collection.query(query_embeddings=qbatch, n_results=req.top_k, where=effective_where, include=["documents", "metadatas", "distances"])
    ids = res.get("ids", [[]])[0]; docs = res.get("documents", [[]])[0]; metas = res.get("metadatas", [[]])[0]; dists = res.get("distances", [[]])[0]
    if not ids:
        return {"answer": "I don’t know based on the current knowledge.", "used": []}
    metas = [(m or {}) if isinstance(m, dict) else {} for m in metas]
    term = focus_term(req.question)
    if term:
        def score(d: str) -> int: return (d or "").lower().count(term)
        scored = [(i, d, m, score(d)) for i, d, m in zip(ids, docs, metas)]
        filtered = [t for t in scored if t[3] > 0]
        chosen = filtered if filtered else scored
        if chosen:
            chosen.sort(key=lambda t: t[3], reverse=True)
            ids, docs, metas = zip(*[(c[0], c[1], c[2]) for c in chosen]); ids, docs, metas = list(ids), list(docs), list(metas)
    ids, docs, metas = ids[:MAX_DOCS], docs[:MAX_DOCS], metas[:MAX_DOCS]
    ctx_lines = []
    for i, (d, m, id_) in enumerate(zip(docs, metas, ids), start=1):
        tag = (m or {}).get("type")
        ctx_lines.append(f"[{i}] id={id_} type={tag}\n{trim_text(d, MAX_CHARS_PER_DOC)}")
    context = "\n\n".join(ctx_lines)
    if ANSWER_ECHO_ONLY:
        snippet = trim_text(docs[0] if docs else "", 200)
        used = [{"id": ids[0], "text": docs[0], "metadata": metas[0]}] if ids else []
        return {"answer": snippet or "I don’t know based on the current knowledge.", "used": used}
    prompt = (
        "Answer ONLY about the specific subject asked.\n"
        "Use ONLY the provided context; if it doesn't contain the answer, say you don't know.\n"
        "Do not include citations, bracketed numbers, or source IDs.\n"
        f"Question: {req.question}\n\nContext:\n{context}\n\n"
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
                "options": {"num_predict": MAX_PREDICT, "temperature": 0.2, "top_p": 0.9, "repeat_penalty": 1.1, "num_thread": os.cpu_count() or 4,},
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
# WS SENDER
# =====================================================================
async def _ws_sender(ws: WebSocket, q: asyncio.Queue):
    try:
        while True:
            msg = await q.get()
            state = getattr(ws, "application_state", None)
            if state and state != WebSocketState.CONNECTED:
                break
            try:
                await ws.send_text(msg)
                print(f"[WS] actually sent -> {msg[:120]}...")
            except Exception as e:
                print(f"[WS][send_error] {e} — stopping sender")
                break
    except asyncio.CancelledError:
        pass

async def _background_summary_task(send_queue: asyncio.Queue, seg: str):
    try:
        raw = await summarize_async(seg)
        out = (raw or "").strip()

        # Skip handling
        first_line = ""
        for ln in out.splitlines():
            s = ln.strip()
            if s:
                first_line = s
                break
        if not out or first_line.upper().startswith("SKIP"):
            return

        lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        title = "Summary"; text_lines = []
        if lines:
            m = re.match(r'^Title\s*:\s*(.+)$', lines[0], flags=re.IGNORECASE)
            if m:
                title = m.group(1).strip(); text_lines = lines[1:]
            else:
                first = re.sub(r'^(?:[-*•]\s*|\d+[.)]\s*)', '', lines[0]).strip()
                if first: title = first
                text_lines = lines[1:]
        cleaned = [re.sub(r'^(?:[-*•]\s*|\d+[.)]\s*)', '', ln).strip() for ln in text_lines]
        text = "\n".join([ln for ln in cleaned if ln]) or title
        payload = {"summary_item": {"title": title, "text": text}}
        await send_queue.put(json.dumps(payload, ensure_ascii=False))
        print(f"[WS] queued summary_item (bg) -> title='{title}' text='{text[:80]}...'")
    except Exception as e:
        print(f"[WS] background summary failed: {e}")

# =====================================================================
# WS AUDIO HANDLER
# =====================================================================
async def handle_audio_ws(websocket: WebSocket):
    print("[WS] connected")
    send_queue: asyncio.Queue = asyncio.Queue()
    sender_task = asyncio.create_task(_ws_sender(websocket, send_queue))
    bg_tasks: set[asyncio.Task] = set()

    speaking = False
    last_voice = time.time()
    last_partial_t = 0.0
    last_partial_text = ""
    closing = False

    tail = np.zeros(int(OVERLAP_SEC * SAMPLE_RATE), dtype=np.int16)
    buf: List[np.ndarray] = []

    now = lambda: time.time()
    LISTENING_HINT_DELAY = 0.8
    listening_sent = False

    rolling = RollingSummarizer(
        threshold_chars=int(os.getenv("SUMMARY_CHUNK_CHARS", str(SUMMARY_CHUNK_CHARS))),
        fn=lambda s: s,
        cooldown_sec=0.5
    )

    # CHAR_UPSERT_URL = os.getenv("CHAR_UPSERT_URL", "http://127.0.0.1:3000/api/characters/upsert")
    campaign_id: Optional[str] = None

    try:
        qp = dict(websocket.query_params)
        if qp.get("campaignId"):
            campaign_id = qp["campaignId"].strip() or None
            print(f"[WS] campaign_id set via query -> {campaign_id}")
    except Exception:
        pass
    try:
        hdrs = getattr(websocket, "headers", None)
        if not campaign_id and hdrs:
            cid = hdrs.get("x-campaign-id")
            if cid:
                campaign_id = cid.strip() or None
                print(f"[WS] campaign_id set via header -> {campaign_id}")
    except Exception:
        pass

    # async def _post_characters_chunk_local(campaign_id_: Optional[str], text: str):

    async def _flush_and_finish(reason: str):
        # global last_upsert_t
        leftover = rolling.flush().strip()
        if leftover:
            task = asyncio.create_task(_background_summary_task(send_queue, leftover))
            bg_tasks.add(task)
            task.add_done_callback(lambda t, s=bg_tasks: s.discard(t))

        try:
            await asyncio.wait_for(asyncio.gather(*bg_tasks, return_exceptions=True), timeout=SUMMARY_DRAIN_TIMEOUT)
        except asyncio.TimeoutError:
            for t in list(bg_tasks):
                t.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await asyncio.gather(*bg_tasks, return_exceptions=True)
        try:
            await send_queue.put(json.dumps({"status": "ended", "reason": reason}))
        except Exception:
            pass

    async def _finalize_current_utter(reason: str = "silence"):
        nonlocal speaking, tail, buf, last_partial_text, last_partial_t
        try:
            utter = np.concatenate([tail, *buf]) if buf else tail
            wave = utter.astype(np.float32) / 32768.0
            final_text = transcribe_float32(wave)
            if final_text:
                print(f"[final/{reason}] {final_text}")
                print(f"[final/{reason}] {len(final_text.split())} words recognized.")
                if not closing:
                    await send_queue.put(json.dumps({"final": final_text}))

                # embed live chunk
                try:
                    ensure_collection()
                    doc_id = f"live_{int(time.time()*1000)}"
                    meta = {"type": "raw", "source": "live_ws"}
                    collection.add(ids=[doc_id], documents=[final_text], metadatas=[meta])
                    print(f"[Embed] Added live chunk -> id={doc_id}, len={len(final_text)} chars")
                except Exception as e:
                    print(f"[Embed] failed to add live chunk: {e}")

                # schedule summaries 
                segments = rolling.push(final_text)
                if isinstance(segments, str):
                    segments = [segments] if segments else []
                elif not isinstance(segments, list):
                    segments = []
                for seg in segments:
                    seg = (seg or "").strip()
                    if not seg:
                        continue
                    task = asyncio.create_task(_background_summary_task(send_queue, seg))
                    bg_tasks.add(task)
                    task.add_done_callback(lambda t, s=bg_tasks: s.discard(t))

                # optional force flush small remainder
                if (not segments) and SUMMARY_FORCE_FLUSH_AFTER_FINAL:
                    small = rolling.flush()
                    if small and len(small) >= SUMMARY_MIN_FLUSH_CHARS:
                        task = asyncio.create_task(_background_summary_task(send_queue, small))
                        bg_tasks.add(task)
                        task.add_done_callback(lambda t, s=bg_tasks: s.discard(t))
                    elif small:
                        try:
                            rolling._buf = [small]
                        except Exception:
                            pass
        except Exception as e:
            print(f"[WS] _finalize_current_utter failed: {e}")
        finally:
            # update overlap tail; reset buffers
            utter = np.concatenate([tail, *buf]) if buf else tail
            if utter.size >= tail.size:
                tail = utter[-tail.size:].copy()
            else:
                z = np.zeros(tail.size - utter.size, dtype=np.int16)
                tail = np.concatenate([z, utter])
            buf.clear()
            last_partial_text = ""
            last_partial_t = now()
            speaking = False

    utter_start_t: Optional[float] = None

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=SESSION_IDLE_SEC)
            except asyncio.TimeoutError:
                await _flush_and_finish("idle")
                closing = True
                with contextlib.suppress(Exception):
                    await websocket.close()
                break

            if "text" in msg and msg["text"] is not None:
                text_frame = (msg["text"] or "").strip()
                if text_frame:
                    print(f"[WS] text frame: {text_frame[:160]}")
                try:
                    obj = json.loads(text_frame)
                    if isinstance(obj, dict):
                        t = str(obj.get("type") or "").strip().lower()
                        if t in ("set_campaign", "setcampaign"):
                            cid = (obj.get("campaignId") or "").strip()
                            campaign_id = cid or campaign_id
                            print(f"[WS] campaign_id set via JSON -> {campaign_id}")
                            if not closing:
                                try:
                                    await send_queue.put(json.dumps({"status": "campaign_set", "campaignId": campaign_id}))
                                except Exception:
                                    pass
                            continue
                except Exception:
                    pass

                if text_frame == "__END__":
                    await _flush_and_finish("__END__")
                    closing = True
                    break

                continue

            if "bytes" not in msg or msg["bytes"] is None:
                continue
            message = msg["bytes"]
            pcm16 = np.frombuffer(message, dtype=np.int16)

            if is_speech_int16(pcm16):
                if not speaking:
                    speaking = True
                    listening_sent = False
                    utter_start_t = now()
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
                            if not closing:
                                await send_queue.put(json.dumps({"partial": text}))
                            last_partial_text = text
                    except Exception as e:
                        print(f"[WS] partial failed:", e)
                    last_partial_t = now()

            else:
                if (not speaking) and (now() - last_voice >= LISTENING_HINT_DELAY) and (not listening_sent):
                    if not closing:
                        try:
                            await send_queue.put(json.dumps({"partial": "[listening…]"}))
                        except Exception:
                            pass
                    listening_sent = True

                if speaking and (now() - last_voice) * 1000 >= SILENCE_END_MS:
                    await _finalize_current_utter("silence")

            # hard limit per-utterance; force finalization immediately
            if speaking and utter_start_t and (now() - utter_start_t) >= MAX_UTTER_SEC:
                print(f"[ForceFinal] {MAX_UTTER_SEC}s reached — forcing final")
                await _finalize_current_utter("timeout")
                utter_start_t = None

            await asyncio.sleep(0)

    except WebSocketDisconnect:
        print("[WS] disconnected")
        try:
            leftover = rolling.flush().strip()
            if leftover:
                seg = leftover
                task = asyncio.create_task(_background_summary_task(send_queue, seg))
                bg_tasks.add(task)
                task.add_done_callback(lambda t, s=bg_tasks: s.discard(t))
        finally:
            try:
                await asyncio.wait_for(asyncio.gather(*bg_tasks, return_exceptions=True), timeout=SUMMARY_DRAIN_TIMEOUT)
            except asyncio.TimeoutError:
                for t in list(bg_tasks):
                    t.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await asyncio.gather(*bg_tasks, return_exceptions=True)
            sender_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await sender_task
            return

    except Exception as e:
        print("[WS] error:", e)
        for t in list(bg_tasks):
            t.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.gather(*bg_tasks, return_exceptions=True)
        sender_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sender_task
        return

@app.websocket("/audio")
async def ws_audio_legacy(websocket: WebSocket):
    await websocket.accept()
    await handle_audio_ws(websocket)

# =====================================================================
# FILE TRANSCRIBE
# =====================================================================
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    tmp_path = None
    try:
        suffix = os.path.splitext(file.filename or "")[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name
        segs, _ = whisper.transcribe(tmp_path, language=LANG, beam_size=BEAM, vad_filter=True, vad_parameters=dict(min_silence_duration_ms=500))
        text = " ".join(s.text for s in segs).strip()
        return {"text": text}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if tmp_path:
            with contextlib.suppress(Exception):
                os.remove(tmp_path)

# =====================================================================
# ENTRYPOINT
# =====================================================================
if __name__ == "__main__":
    os.makedirs(DB_PATH, exist_ok=True)
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
