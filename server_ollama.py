# server_ollama.py
import os
from typing import List, Optional, Dict, Any
import requests
from fastapi import FastAPI
from pydantic import BaseModel
import chromadb

# ---- Settings ----
DB_PATH = os.environ.get("CHROMA_DB_PATH", "./chroma_db")
COLLECTION_NAME = os.environ.get("CHROMA_COLLECTION", "docs")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")

# --- Ollama embedding function (Chroma 0.4.16+ compatible) ---
class OllamaEmbeddingFunction:
    def __init__(self, base_url: str = OLLAMA_URL, model: str = EMBED_MODEL, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def name(self) -> str:
        # Used by Chroma to persist/compare the EF identity
        return f"ollama::{self.model}"

    # IMPORTANT: param must be named `input`
    def __call__(self, input: list[str]) -> list[list[float]]:
        if isinstance(input, str):
            texts = [input]
        else:
            texts = input

        url = f"{self.base_url}/api/embeddings"
        out: list[list[float]] = []
        for t in texts:
            r = requests.post(url, json={"model": self.model, "prompt": t}, timeout=self.timeout)
            r.raise_for_status()
            out.append(r.json()["embedding"])
        return out

# ---- Chroma persistent client ----
client = chromadb.PersistentClient(path=DB_PATH)
ef = OllamaEmbeddingFunction()
collection = client.get_or_create_collection(
    name=COLLECTION_NAME,
    embedding_function=ef,
)

# ---- API types ----
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

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # or lock to your origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
def healthz():
    # quick check Ollama is reachable
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        ok = r.status_code == 200
    except Exception:
        ok = False
    return {
        "status": "ok",
        "collection": COLLECTION_NAME,
        "ollama": "up" if ok else "unreachable",
        "embed_model": EMBED_MODEL
    }

@app.post("/ingest")
def ingest(req: IngestRequest):
    ids = [i.id for i in req.items]
    docs = [i.text for i in req.items]
    metas = [i.metadata or {} for i in req.items]
    # Upsert-like behavior
    # If you ever get duplicate ID errors on old Chroma versions, delete then add.
    collection.add(ids=ids, documents=docs, metadatas=metas)
    return {"ok": True, "count": len(ids)}

@app.post("/query")
def query(req: QueryRequest):
    res = collection.query(
        query_texts=[req.query],
        n_results=req.top_k,
        where=req.where
    )
    out = []
    for i in range(len(res["ids"][0])):
        out.append({
            "id": res["ids"][0][i],
            "text": res["documents"][0][i],
            "metadata": res["metadatas"][0][i],
            "distance": res.get("distances", [[None]])[0][i] if "distances" in res else None,
        })
    return {"results": out}
