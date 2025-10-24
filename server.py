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
# Allow MKL/OpenMP to load even if duplicates are detected on some platforms
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
# Avoid symlink use in HF cache (helps on some filesystems)
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")

# Core audio and streaming knobs
SAMPLE_RATE = 16000                  # VAD and Whisper expect 16 kHz PCM
SILENCE_END_MS = 800                 # Silence threshold to finalize an utterance
PARTIAL_INTERVAL = 0.9               # Seconds between partial ASR updates
OVERLAP_SEC = 0.2                    # Overlap for partial decoding context

# Summarization chunk sizing
SUMMARY_CHUNK_CHARS = 240

# Whisper configuration
WHISPER_MODEL = "small"
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE ="int8"
LANG = "en"
BEAM = 1
TEMP = 0.0

# Vector store configuration
DB_PATH = "./chroma_db"
COLLECTION_NAME = "docs"

# Ollama endpoints and models
OLLAMA_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "nomic-embed-text"

# LLM used for short summaries and final answers
OLLAMA_SUMMARY_MODEL = "phi3:medium"
OLLAMA_TIMEOUT = 120

# Answering behavior
MAX_DOCS = 3
MAX_CHARS_PER_DOC = 800
STOP_SENTINEL = "<END>"
MAX_PREDICT = 96
ANSWER_ECHO_ONLY = "0" == "1"  # debug mode to echo context
MAX_UTTER_SEC = 15.0  # hard cap per utterance

# Rolling summarizer behavior
SUMMARY_MIN_FLUSH_CHARS = 80
SUMMARY_FORCE_FLUSH_AFTER_FINAL = "1" == "1"
SUMMARY_DRAIN_TIMEOUT = 5.0
SESSION_IDLE_SEC = 8.0  # WS auto-close after idle

# =====================================================================
# SHARED CLIENTS (Whisper, VAD)
# =====================================================================
print("[Init] Loading Whisper model…")
# Whisper ASR instance reused across requests to avoid cold start penalties
whisper = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
# WebRTC VAD for simple voice activity detection on 20 ms frames
vad = webrtcvad.Vad(2)

# =====================================================================
# EMBEDDINGS (Ollama) — tolerant to Chroma EF API changes
# =====================================================================
# EmbeddingFunction implementation that talks to Ollama /api/embeddings
AllowedMeta = Union[str, int, float, bool]

class OllamaEmbeddingFunction:
    def __init__(self, base_url: str = OLLAMA_URL, model: str = EMBED_MODEL, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def __call__(self, input: List[str]) -> List[List[float]]:
        # Chroma may call EF directly via __call__
        texts = [input] if isinstance(input, str) else input
        return self._embed(texts)

    def name(self) -> str:
        return f"ollama::{self.model}"

    def embed_documents(self, input: List[str], **kwargs) -> List[List[float]]:
        # Backward-compat with EF usage in older Chroma versions
        texts = [input] if isinstance(input, str) else input
        return self._embed(texts)

    def embed_query(self, input: Union[str, List[str]], **kwargs) -> List[List[float]]:
        # Some EF APIs treat query separately; we normalize to list-of-list
        text = input[0] if isinstance(input, list) else input
        return self._embed([text])

    def _embed(self, texts: List[str]) -> List[List[float]]:
        # Makes one HTTP call per text to keep error boundaries simple
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

# Global EF instance shared by Chroma
ef = OllamaEmbeddingFunction()

def embed_query_batched(text: str) -> List[List[float]]:
    """
    Defensive wrapper to obtain a single query embedding as a list-of-list.
    Handles minor API shape differences across EF versions and falls back to raw HTTP.
    """
    try:
        vec = ef.embed_query(input=text)
    except TypeError:
        # Some EF versions accept positional arg
        try:
            vec = ef.embed_query(text)
        except Exception:
            # Last resort: call EF like a function, then raw HTTP
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

    # Normalize shapes: [floats] -> [[floats]]
    if isinstance(vec, list) and vec and isinstance(vec[0], float):
        return [vec]
    if isinstance(vec, list) and vec and isinstance(vec[0], list):
        return vec
    raise RuntimeError(f"Unexpected embedding shape from EF: {type(vec)}")

# =====================================================================
# CHROMA (single persistent DB for all campaigns)
# =====================================================================
from threading import RLock

# One on-disk DB path and one collection shared by all campaigns
_client_lock = RLock()
_client: chromadb.PersistentClient = None
_collection: Any | None = None

def _db_path_for_campaign(campaign_id: str | None) -> str:
    """Single shared DB path (campaign_id ignored for storage)."""
    return DB_PATH

def _ensure_collection() -> Any:
    global _client, _collection
    with _client_lock:
        if _collection is not None:
            return _collection
        os.makedirs(DB_PATH, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=DB_PATH,
            settings=Settings(anonymized_telemetry=False)
        )
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=ef
        )
        print(f"[Chroma] ready at {DB_PATH}, collection={COLLECTION_NAME} (single DB for all campaigns)")
        return _collection

def get_collection_for_campaign(campaign_id: str | None) -> Any:
    """
    Return the single shared collection. campaign_id is only used in metadata/filters.
    """
    return _ensure_collection()

def ping_collection(campaign_id: str | None) -> None:
    """Simple health check against the single shared collection."""
    try:
        _ensure_collection().count()
    except Exception as e:
        print(f"[Chroma] health failed: {e} — reinit")
        with _client_lock:
            # Drop and recreate client/collection handle
            global _client, _collection
            _client = None
            _collection = None
        _ensure_collection()

# Eager init
_ = _ensure_collection()

# =====================================================================
# APP + LIFESPAN
# =====================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    App lifespan hook used to warm Ollama models for faster first request.
    """
    try:
        # Warm up generate endpoint
        requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/generate",
            headers={"Content-Type": "application/json"},
            json={"model": OLLAMA_SUMMARY_MODEL, "prompt": "ok", "stream": False, "keep_alive": "1h"},
            timeout=50,
        )
        # Warm up embeddings endpoint
        requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/embeddings",
            headers={"Content-Type": "application/json"},
            json={"model": EMBED_MODEL, "prompt": "warmup"},
            timeout=50,
        )
        print("[Warmup] Ollama models loaded")
    except Exception as e:
        # Server should still boot if warmup fails
        print("[Warmup] skipped:", e)
    yield

# FastAPI app instance with permissive CORS by default
app = FastAPI(lifespan=lifespan)
allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

# =====================================================================
# UTILS
# =====================================================================
def focus_term(q: str) -> Optional[str]:
    """
    Heuristic for extracting a focus term from a query.
    Attempts 'who is X' first; otherwise returns the longest capitalized token.
    """
    ql = q.lower().strip()
    m = re.search(r"\bwho\s+is\s+([a-z0-9' -]+)\b", ql)
    if m:
        return m.group(1).strip()
    caps = re.findall(r"\b[A-Z][a-zA-Z'-]{2,}\b", q)
    return max(caps, key=len).lower() if caps else None

def first_n_sentences(t: str, n: int = 2) -> str:
    """
    Return the first n sentence-like segments based on simple punctuation boundaries.
    """
    parts = re.split(r'(?<=[.!?])\s+', t.strip())
    return ' '.join(parts[:n]).strip()

def trim_text(s: str, n: int) -> str:
    """
    Truncate long strings with an ellipsis suffix to fit display constraints.
    """
    s = s or ""
    return s if len(s) <= n else s[:n] + "…"

def chunk_text(
    text: str,
    max_chars: int = int(os.getenv("CHUNK_CHARS", "800")),
    overlap: int = int(os.getenv("CHUNK_OVERLAP", "30"))
) -> List[str]:
    """
    Split text into overlapping sentence-based chunks for embedding.
    Overlap helps maintain context across boundaries.
    """
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
    """
    Ensure metadata contains only JSON-serializable primitives required by Chroma.
    """
    out: Dict[str, AllowedMeta] = {}
    if not meta:
        return out
    for k, v in meta.items():
        if v is None:
            continue
        out[k] = v if isinstance(v, (str, int, float, bool)) else str(v)
    return out

def is_speech_int16(pcm16: np.ndarray) -> bool:
    """
    Run VAD on a 16-bit PCM audio buffer at SAMPLE_RATE.
    Returns True if VAD detects speech on this frame.
    """
    try:
        # Ensure multiples of 20 ms for WebRTC VAD (at 16 kHz -> 320 samples)
        frame = 320
        n = (pcm16.size // frame) * frame
        if n <= 0:
            return False
        buf = pcm16[:n].reshape(-1, frame)
        return any(vad.is_speech(chunk.tobytes(), SAMPLE_RATE) for chunk in buf)
    except Exception:
        # Fail open to avoid breaking the stream on occasional errors
        return False

def transcribe_float32(wave_f32: np.ndarray) -> str:
    """
    Transcribe a float32 mono waveform array using faster-whisper.
    VAD is handled externally; this runs pure ASR.
    """
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
    """
    Summarize a transcript chunk with strict extraction rules for TTRPG notes.
    Retries on transient network issues with exponential backoff.
    """
    print(f"\n[Summary] Calling Ollama with {len(text.split())} words")
    print(f"[Summary] Input preview: {text[:150]}...\n")

    # The prompt keeps the model faithful to the transcript and allows SKIP output
    prompt = (
        "You are a STRICT extractor for TTRPG session notes.\n"
        "\n"
        "HARD RULES:\n"
        "• Use ONLY facts explicitly stated in the transcript; if unsure, omit.\n"
        "• Do NOT invent, rename, or alter entities (names, items, places). Spell them EXACTLY as written.\n"
        "• Ignore out-of-character chat (jokes, logistics, rules talk).\n"
        "• Do NOT mention dice, numbers, or mechanics details at all "
        "(no rolls, modifiers, totals, DCs, 'natural one', advantage/disadvantage). "
        "Summarize outcomes qualitatively only (e.g., “the perception check succeeds”).\n"
        "• Do NOT add meta commentary such as “no further details provided”, “unclear”, or similar filler. "
        "If details are missing, simply omit them.\n"
        "• No storytelling color; keep to factual recap.\n"
        "\n"
        "OUTPUT (exactly one section):\n"
        "Write a single two-part section with this format ONLY:\n"
        "A short 3-5-word title in Title Case (no prefixes, numbering, or labels).\n"
        "One or two plain sentences strictly derived from the transcript.\n"
        "Do not include bullets, lists, or any extra prefixes/labels. "
        "Do NOT write the words 'Heading', 'Body', or 'Transcript chunk' anywhere.\n"
        "Do NOT repeat or quote the transcript and NEVER write the literal phrase 'Transcript chunk:'.\n"
        "If the chunk is only out-of-character or has no in-game content, output exactly: SKIP\n"
        "\n"
        f"Transcript chunk:\n{text}\n"
    )

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "1h",
        "options": {"temperature": 0.0},
        "stop": [
            "\nTranscript chunk:", "Transcript chunk:",
            "\nTranscript:", "Transcript:",
            "\nContext:", "Context:",
            "\nSource:", "Source:",
            "\nInput:", "Input:"
        ]
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
            # Retry timeouts with exponential backoff
            if attempt < max_retries:
                sleep_s = backoff_base * (2 ** attempt)
                print(f"[Summary][retry] Timeout, retrying in {sleep_s:.2f}s (attempt {attempt+1}/{max_retries})")
                time.sleep(sleep_s)
                continue
            return "[Error] Timeout contacting Ollama"
        except requests.exceptions.RequestException as e:
            # Retry only connection errors; bubble up other HTTP errors
            if attempt < max_retries and isinstance(e, requests.exceptions.ConnectionError):
                sleep_s = backoff_base * (2 ** attempt)
                print(f"[Summary][retry] Connection error, retrying in {sleep_s:.2f}s (attempt {attempt+1}/{max_retries}): {e}")
                time.sleep(sleep_s)
                continue
            return f"[Error] {e}"

async def summarize_async(text: str) -> str:
    """
    Run the blocking summarizer in a thread to keep the event loop responsive.
    """
    return await asyncio.to_thread(summarize_with_ollama, text)

class RollingSummarizer:
    """
    Simple rolling buffer that collects text until a character threshold,
    then emits segments aligned to sentence boundaries where possible.
    """
    def __init__(self, threshold_chars: int = SUMMARY_CHUNK_CHARS, fn: Optional[Callable[[str], str]] = None, cooldown_sec: float = 0.0, min_chunk_chars: int = 120):
        self.threshold = max(1, int(threshold_chars))
        self.min_chunk = max(1, int(min_chunk_chars))
        self.fn = fn or (lambda s: s)           # identity by default
        self.cooldown_sec = cooldown_sec
        self._buf: list[str] = []
        self._carry: str = ""                   # residual text below min_chunk
        self._last_t = 0.0

    def _split_on_sentence(self, s: str, hard_len: int) -> int:
        """
        Choose a cut index near the threshold that ends at a sentence-like boundary.
        If none found, return hard_len.
        """
        if len(s) < hard_len:
            return 0
        chunk = s[:hard_len]
        tail = chunk[-40:]
        for p in ("。", "!", "?", "."):
            i = tail.rfind(p)
            if i != -1:
                return (hard_len - len(tail)) + i + 1
        return hard_len

    def push(self, text: str) -> list[str]:
        """
        Add new text to the rolling buffer and emit zero or more processed segments.
        Respects cooldown to avoid over-emitting very small chunks.
        """
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
                # Not worth summarizing; carry forward
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

        # Keep small remainder for the next push unless we can safely emit it
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
        """
        Emit any remaining text in the buffer without enforcing thresholds.
        Intended for end-of-session or utterance finalization.
        """
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
    campaign_id: Optional[str] = None  

class IngestItem(BaseModel):
    id: str
    text: str
    metadata: Optional[Dict[str, Any]] = None

class IngestRequest(BaseModel):
    items: List[IngestItem]
    campaign_id: Optional[str] = None 

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    where: Optional[Dict[str, Any]] = None
    campaign_id: Optional[str] = None 

class AnswerRequest(BaseModel):
    question: str
    top_k: int = 5
    where: Optional[Dict[str, Any]] = None
    campaign_id: Optional[str] = None 

# =====================================================================
# ROUTES: HEALTH / ADMIN
# =====================================================================
@app.get("/health")
def health(campaign_id: Optional[str] = None):
    ping_collection(campaign_id)
    coll = get_collection_for_campaign(campaign_id)
    return {
        "ok": True,
        "models": {"whisper": WHISPER_MODEL, "embed": EMBED_MODEL, "gen": OLLAMA_SUMMARY_MODEL},
        "db": {
            "path": _db_path_for_campaign(None),   # always DB_PATH
            "collection": COLLECTION_NAME,
            "campaign": campaign_id,               # echoed for client UI only
            "count": coll.count(),
        },
    }

@app.post("/admin/clear_collection")
def admin_clear_collection(campaign_id: Optional[str] = None):
    """
    Hard delete of all vectors and metadata in the selected campaign collection.
    """
    coll = get_collection_for_campaign(campaign_id)
    try:
        coll.delete(where={})
        return {"ok": True, "cleared": True, "campaign_id": campaign_id}
    except Exception as e:
        raise HTTPException(500, f"clear failed: {e}")

@app.post("/admin/reset_disk")
def admin_reset_disk(campaign_id: Optional[str] = None):
    """
    Resets the single shared Chroma DB on disk (campaign_id ignored for storage).
    """
    path = _db_path_for_campaign(None)
    try:
        if os.path.isdir(path):
            shutil.rmtree(path)
        # Drop handles and recreate
        from threading import RLock
        global _client, _collection
        with _client_lock:
            _client = None
            _collection = None
        _ = get_collection_for_campaign(None)
        return {"ok": True, "recreated": True, "path": path, "campaign_id": campaign_id}
    except Exception as e:
        raise HTTPException(500, f"reset_disk failed: {e}")


# =====================================================================
# RAG: INGEST / QUERY / ANSWER
# =====================================================================
@app.post("/ingest_transcript")
def ingest_transcript(req: IngestTranscriptRequest):
    """
    Ingest a full transcript into the vector database (per campaign).
    - Splits the provided transcript text into overlapping sentence-based chunks.
    - Generates unique IDs for each chunk using the given `id_prefix`.
    - Cleans and attaches metadata, tagging each entry as type="raw" and 
    including the `campaign_id` if provided.
    - Inserts all chunks into the Chroma collection associated with the 
    specified campaign (or the default collection if none).
    """
    coll = get_collection_for_campaign(req.campaign_id)
    chunks = chunk_text(req.text)
    if not chunks:
        raise HTTPException(status_code=400, detail="empty transcript")
    base_meta = clean_metadata(req.metadata)
    base_meta["type"] = "raw"
    if req.campaign_id:
        base_meta["campaign_id"] = req.campaign_id
    ids = [f"{req.id_prefix}_{i:04d}" for i in range(len(chunks))]
    metas = [{**base_meta, "chunk_index": i} for i in range(len(chunks))]
    coll.add(ids=ids, documents=chunks, metadatas=metas)
    return {"ok": True, "count": len(ids), "campaign_id": req.campaign_id}

@app.post("/ingest")
def ingest(req: IngestRequest):
    """
    Ingest arbitrary text items into the vector database (per campaign).
    - Accepts a list of items, each with a custom ID, text, and optional metadata.
    - Cleans metadata to ensure only JSON-serializable fields are stored.
    - Automatically tags entries with the campaign ID when provided.
    - Adds all items to the Chroma collection for the selected campaign, or to
    the default collection if no campaign is specified.
    """
    coll = get_collection_for_campaign(req.campaign_id)
    ids = [str(i.id) for i in req.items]
    docs = [i.text for i in req.items]
    metas = [clean_metadata(i.metadata) for i in req.items]
    if req.campaign_id:
        for m in metas:
            m["campaign_id"] = req.campaign_id
    if not (len(ids) == len(docs) == len(metas)):
        raise HTTPException(status_code=400, detail="ids/docs/metadatas length mismatch")
    coll.add(ids=ids, documents=docs, metadatas=metas)
    return {"ok": True, "count": len(ids), "campaign_id": req.campaign_id}

@app.post("/query")
def query(req: QueryRequest):
    """
    Perform a semantic vector search within the selected campaign database.
    - Embeds the input query text using the Ollama embedding model.
    - Searches the campaign’s Chroma collection for the most similar documents.
    - Returns the top_k matching chunks with their stored metadata and distances.
    """
    coll = get_collection_for_campaign(req.campaign_id)
    try:
        qbatch = embed_query_batched(req.query)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Query embedding failed: {e}")
    res = coll.query(
        query_embeddings=qbatch,
        n_results=req.top_k,
        where=req.where,
        include=["documents", "metadatas", "distances"]
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
            "distance": dists[i] if i < len(dists) else None
        })
    return {"results": items, "campaign_id": req.campaign_id}

@app.post("/answer")
def answer(req: AnswerRequest):
    """
    Retrieve contextually relevant chunks and generate a grounded answer 
    using the LLM (RAG pipeline).
    - Embeds the user's question via the Ollama embedding model.
    - Queries the campaign's Chroma collection for the most relevant chunks.
    - Builds a short context window from the retrieved results.
    - Prompts the LLM to answer *only* from that context — it will respond 
    with “I don't know” if no sufficient information is found.
    - Optionally re-ranks results based on focus terms (e.g. named entities).
    """
    coll = get_collection_for_campaign(req.campaign_id)
    effective_where = req.where if (req.where and len(req.where)) else {"type": "raw"}
    try:
        qbatch = embed_query_batched(req.question)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Query embedding failed: {e}")

    res = coll.query(
        query_embeddings=qbatch,
        n_results=req.top_k,
        where=effective_where,
        include=["documents", "metadatas", "distances"]
    )
    ids = res.get("ids", [[]])[0]; docs = res.get("documents", [[]])[0]; metas = res.get("metadatas", [[]])[0]; dists = res.get("distances", [[]])[0]

    if not ids:
        return {"answer": "I don't know based on the current knowledge.", "used": [], "campaign_id": req.campaign_id}

    # Optional re-ranking based on a detected proper noun to improve relevance
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

    # Trim to configured context size
    ids, docs, metas = ids[:MAX_DOCS], docs[:MAX_DOCS], metas[:MAX_DOCS]

    # Build a short plain-text context for the model
    ctx_lines = []
    for i, (d, m, id_) in enumerate(zip(docs, metas, ids), start=1):
        tag = (m or {}).get("type")
        ctx_lines.append(f"[{i}] id={id_} type={tag}\n{trim_text(d, MAX_CHARS_PER_DOC)}")
    context = "\n\n".join(ctx_lines)

    if ANSWER_ECHO_ONLY:
        # Debug mode: just echo the first snippet
        snippet = trim_text(docs[0] if docs else "", 200)
        used = [{"id": ids[0], "text": docs[0], "metadata": metas[0]}] if ids else []
        return {"answer": snippet or "I don't know based on the current knowledge.", "used": used}

    # Constrained answering prompt; sentinel trimming avoids model ramble
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
    return {"answer": answer_text, "used": used, "campaign_id": req.campaign_id}

# =====================================================================
# WS SENDER
# =====================================================================
async def _ws_sender(ws: WebSocket, q: asyncio.Queue):
    """
    Dedicated sender coroutine pulling JSON strings from a queue and
    sending them over the WebSocket. Terminates when the socket closes.
    """
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
        # Normal shutdown path
        pass

async def _background_summary_task(send_queue: asyncio.Queue, seg: str):
    """
    Run summarization for a segment and enqueue a 'summary_item' message
    unless the model decides to SKIP the chunk.
    """
    try:
        raw = await summarize_async(seg)
        out = (raw or "").strip()

        # --- Strip any echoed transcript/context labels & anything after them ---
        m = re.search(r'(?im)^\s*(Transcript(?:\s+chunk)?|Context|Source|Input)\s*:', out)
        if m:
            out = out[:m.start()].strip()

        # Remove explicit "Heading"/"Body" labels if the model sneaks them in
        lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        if lines:
            # Clean heading line
            heading = re.sub(r'^(?:Title|Heading|Body)\s*[—:\-]\s*', '', lines[0], flags=re.IGNORECASE)
            heading = re.sub(r'^(?:[-*•]\s*|\d+[.)]\s*)', '', heading).strip()
            # Build body from the rest, also stripping labels
            body = " ".join(re.sub(r'^(?:Heading|Body)\s*[—:\-]\s*', '', ln, flags=re.IGNORECASE) for ln in lines[1:])
            # Keep at most 2 sentences in body
            body_sents = re.split(r'(?<=[.!?])\s+', body) if body else []
            body_sents = [s for s in body_sents if s]
            body = " ".join(body_sents[:2]).strip()
            out = "\n".join([heading] + ([body] if body else [])).strip()

        # Remove any stray dice/mechanics or meta-commentary the model might emit
        _ban = re.compile(
            r"(?:\bDC\s*\d+\b|\b\d+\s*\+\s*\d+\b|\bnat(?:ural)?\s*1\b|\bnat(?:ural)?\s*20\b|"
            r"\broll(?:ed)?\b|\bdice\b|\bmodifier\b|\badvantage\b|\bdisadvantage\b)",
            flags=re.IGNORECASE,
        )
        _meta = re.compile(
            r"(?:no (?:further )?details (?:are )?provided|not specified|unclear|insufficient information|"
            r"the narrative does not provide|the text does not mention)",
            flags=re.IGNORECASE,
        )
        # Split by lines; keep headings + sentences that are clean
        cleaned_lines = []
        for ln in out.splitlines():
            s = ln.strip()
            if not s:
                continue
            if _ban.search(s) or _meta.search(s):
                continue
            cleaned_lines.append(s)
        out = "\n".join(cleaned_lines)
        out = re.sub(
            r"(?is)(^|\n)\s*(Follow[- ]?up\s+Question\s*\d*|Follow[- ]?up\s*|Discussion|Reflection|Prompt|Next\s+Question)[:\-\s].*",
            "",
            out,
        ).strip()

        # Detect SKIP early to avoid emitting empty summaries
        first_line = ""
        for ln in out.splitlines():
            s = ln.strip()
            if s:
                first_line = s
                break
        if not out or first_line.upper().startswith("SKIP"):
            return

        # Parse a compact title + body from the model output
        lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        title = "Summary"
        text_lines: list[str] = []
        if lines:
            # Strip accidental prefixes on the first line ("Title:", bullets, numbering)
            first = re.sub(r'^(?:Title\s*:)?\s*', '', lines[0], flags=re.IGNORECASE)
            first = re.sub(r'^(?:[-*•]\s*|\d+[.)]\s*)', '', first).strip()
            if first:
                title = first
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
    """
    Main audio WebSocket handler.
    Receives interleaved binary audio frames and optional text control frames.
    Performs VAD-gated buffering, partial recognition, final ASR, live embedding,
    and background summarization with bounded concurrency.
    """
    print("[WS] connected")
    send_queue: asyncio.Queue = asyncio.Queue()
    sender_task = asyncio.create_task(_ws_sender(websocket, send_queue))
    bg_tasks: set[asyncio.Task] = set()

    # Streaming state
    speaking = False
    last_voice = time.time()
    last_partial_t = 0.0
    last_partial_text = ""
    closing = False

    # Overlap tail improves partial recognition continuity
    tail = np.zeros(int(OVERLAP_SEC * SAMPLE_RATE), dtype=np.int16)
    buf: List[np.ndarray] = []

    now = lambda: time.time()
    LISTENING_HINT_DELAY = 0.8
    listening_sent = False

    # Rolling summarizer collects final ASR text and emits segments
    rolling = RollingSummarizer(
        threshold_chars=int(os.getenv("SUMMARY_CHUNK_CHARS", str(SUMMARY_CHUNK_CHARS))),
        fn=lambda s: s,
        cooldown_sec=0.5
    )

    # Optional campaign scoping passed via query, header, or JSON frame
    campaign_id: Optional[str] = None

    # Extract campaignId from query string if present
    try:
        qp = dict(websocket.query_params)
        if qp.get("campaignId"):
            campaign_id = qp["campaignId"].strip() or None
            print(f"[WS] campaign_id set via query -> {campaign_id}")
    except Exception:
        pass

    # Extract campaignId from headers if present
    try:
        hdrs = getattr(websocket, "headers", None)
        if not campaign_id and hdrs:
            cid = hdrs.get("x-campaign-id")
            if cid:
                campaign_id = cid.strip() or None
                print(f"[WS] campaign_id set via header -> {campaign_id}")
    except Exception:
        pass

    async def _flush_and_finish(reason: str):
        """
        Final drain of rolling summary and background tasks,
        then notify the client that the session ended.
        """
        leftover = rolling.flush().strip()
        if leftover:
            task = asyncio.create_task(_background_summary_task(send_queue, leftover))
            bg_tasks.add(task)
            task.add_done_callback(lambda t, s=bg_tasks: s.discard(t))

        # Wait briefly for any pending summaries, then cancel the rest
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
        """
        Convert the buffered PCM into text, send a 'final' message,
        push the text into Chroma, and schedule summarization of segments.
        """
        nonlocal speaking, tail, buf, last_partial_text, last_partial_t
        try:
            # Concatenate overlap tail with buffered frames to form the utterance
            utter = np.concatenate([tail, *buf]) if buf else tail
            wave = utter.astype(np.float32) / 32768.0
            final_text = transcribe_float32(wave)
            if final_text:
                print(f"[final/{reason}] {final_text}")
                print(f"[final/{reason}] {len(final_text.split())} words recognized.")
                if not closing:
                    await send_queue.put(json.dumps({"final": final_text}))

                # Live embedding of recognized text for immediate retrieval
                try:
                    coll = get_collection_for_campaign(campaign_id)
                    doc_id = f"live_{int(time.time()*1000)}"
                    meta = {"type": "raw", "source": "live_ws"}
                    if campaign_id:
                        meta["campaign_id"] = campaign_id
                    coll.add(ids=[doc_id], documents=[final_text], metadatas=[meta])
                    print(f"[Embed] Added live chunk -> id={doc_id}, len={len(final_text)} chars, campaign={campaign_id}")
                except Exception as e:
                    print(f"[Embed] failed to add live chunk: {e}")

                # Schedule summarization tasks for emitted segments
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

                # Optionally flush small remainder so UI doesn't wait too long
                if (not segments) and SUMMARY_FORCE_FLUSH_AFTER_FINAL:
                    small = rolling.flush()
                    if small and len(small) >= SUMMARY_MIN_FLUSH_CHARS:
                        task = asyncio.create_task(_background_summary_task(send_queue, small))
                        bg_tasks.add(task)
                        task.add_done_callback(lambda t, s=bg_tasks: s.discard(t))
                    elif small:
                        # Keep the tiny remainder for future accumulation
                        try:
                            rolling._buf = [small]
                        except Exception:
                            pass
        except Exception as e:
            print(f"[WS] _finalize_current_utter failed: {e}")
        finally:
            # Update overlap window and reset accumulators
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

    # Measure per-utterance time to enforce MAX_UTTER_SEC
    utter_start_t: Optional[float] = None

    try:
        while True:
            # Receive either control text or binary audio with idle timeout
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=SESSION_IDLE_SEC)
            except asyncio.TimeoutError:
                await _flush_and_finish("idle")
                closing = True
                with contextlib.suppress(Exception):
                    await websocket.close()
                break

            # Handle text control frames
            if "text" in msg and msg["text"] is not None:
                text_frame = (msg["text"] or "").strip()
                if text_frame:
                    print(f"[WS] text frame: {text_frame[:160]}")
                # Simple JSON protocol for setting campaign
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

                # Special terminator for client-driven close
                if text_frame == "__END__":
                    await _flush_and_finish("__END__")
                    closing = True
                    break

                continue  # Ignore other text frames

            # Guard against non-binary messages
            if "bytes" not in msg or msg["bytes"] is None:
                continue

            # Decode raw PCM16 from the binary frame
            message = msg["bytes"]
            pcm16 = np.frombuffer(message, dtype=np.int16)

            # VAD branch: accumulate speech or send listening hint
            if is_speech_int16(pcm16):
                if not speaking:
                    speaking = True
                    listening_sent = False
                    utter_start_t = now()
                    print("[State] speaking started")
                last_voice = now()
                buf.append(pcm16)

                # Periodic partial recognition for UX responsiveness
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
                # If quiet for a short time and not speaking, send a passive hint
                if (not speaking) and (now() - last_voice >= LISTENING_HINT_DELAY) and (not listening_sent):
                    if not closing:
                        try:
                            await send_queue.put(json.dumps({"partial": "[listening…]"}))
                        except Exception:
                            pass
                    listening_sent = True

                # If currently speaking, detect end of utterance by silence window
                if speaking and (now() - last_voice) * 1000 >= SILENCE_END_MS:
                    await _finalize_current_utter("silence")

            # Hard timeout to prevent unbounded buffers on very long speech
            if speaking and utter_start_t and (now() - utter_start_t) >= MAX_UTTER_SEC:
                print(f"[ForceFinal] {MAX_UTTER_SEC}s reached — forcing final")
                await _finalize_current_utter("timeout")
                utter_start_t = None

            await asyncio.sleep(0)

    except WebSocketDisconnect:
        # Normal client disconnect; drain summaries and stop sender
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
        # Any unexpected error: cancel background work and stop sender cleanly
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
    """
    WebSocket endpoint for audio streaming.
    Kept as a thin wrapper to allow reuse of handle_audio_ws.
    """
    await websocket.accept()
    await handle_audio_ws(websocket)

# =====================================================================
# FILE TRANSCRIBE
# =====================================================================
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Transcribe an uploaded audio file.
    Uses a NamedTemporaryFile to store the upload, then runs faster-whisper.
    """
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
            vad_parameters=dict(min_silence_duration_ms=500)
        )
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
    """
    Start the FastAPI app under Uvicorn.
    reload=False because the global clients are not reload-safe by default.
    """
    os.makedirs(DB_PATH, exist_ok=True)
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)