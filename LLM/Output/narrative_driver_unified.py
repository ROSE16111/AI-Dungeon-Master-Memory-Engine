#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Narrative Information Extraction Driver (Unified, EN output)

Usage examples:
  python narrative_driver_unified.py --input /path/to/file.docx --model ollama --model-name llama3.1 --chunk-size 1000 --overlap 180 --outdir ./output
  python narrative_driver_unified.py --input /path/to/file.txt  --model mock                                  --outdir ./output

Notes:
- Supported inputs: .docx, .txt, .md
- LLM backends:
    * ollama : call local Ollama /api/generate
    * mock   : deterministic fake outputs for local testing
- Output:
    * <doc_id>_final.json  (merged state + last summary_en)
    * CSVs for characters, locations, items, events, relations, unresolved
"""

import argparse
import csv
import json
import re
import time
from typing import Any, Dict, List, Optional
from pathlib import Path

# ------------------------------
# Schema (English, forces English output)
# ------------------------------
SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["doc_id", "chunk_id", "state", "summary_en", "normalized_notes"],
    "properties": {
        "doc_id": {"type": "string"},
        "chunk_id": {"type": "integer"},
        "state": {
            "type": "object",
            "required": ["characters", "locations", "items", "events", "relations", "unresolved"],
            "properties": {
                "characters": {"type": "array"},
                "locations": {"type": "array"},
                "items": {"type": "array"},
                "events": {"type": "array"},
                "relations": {"type": "array"},
                "unresolved": {"type": "array"}
            }
        },
        "summary_en": {"type": "string"},
        "normalized_notes": {"type": "array"}
    }
}

# ------------------------------
# Prompt Templates (English)
# ------------------------------
SYSTEM_PROMPT = """You are a Narrative Information Extraction & Summarization assistant.
Goal: From the provided text chunk, identify characters, locations, items, events (with timeline), and relations,
and return a JSON object that STRICTLY conforms to the given JSON Schema. Also provide an English plot summary.

Hard requirements:
1) No hallucination: every fact must come from the text; if unknown, use null or empty arrays.
2) Provide evidence spans when possible (e.g., "L23-L31" or "chunk#2: 120–180 chars").
3) DO NOT infer “players” just because the text mentions tasks or puzzles. Identify entities by proper nouns and references.
   If no name is given, use "Unknown Character #n", etc.
4) Deterministic, stable output: fixed field order; English only; normalized formats. No extra fields.
5) Long document handling: each call handles one chunk and returns a full cumulative state up to this chunk.
6) Return ONLY the JSON object; do not include any explanations.
"""

USER_PROMPT_TEMPLATE = """[DOC_META]
doc_id: {doc_id}
chunk_id: {chunk_id}
total_chunks: {total_chunks}
chunk_span: {chunk_span}
previous_state: {previous_state}

[TASK]
Please:
1) Extract structured information strictly according to the JSON Schema;
2) Provide a 200–400 word English plot summary as "summary_en";
3) Return ONLY the JSON object; no extra text.

[JSON_SCHEMA]
{json_schema}

[TEXT_CHUNK]
{chunk_text}
"""

# ------------------------------
# Utilities
# ------------------------------
def read_text_from_file(path: Path) -> str:
    """Read text from .docx / .txt / .md"""
    if path.suffix.lower() == ".docx":
        try:
            from docx import Document
        except Exception as e:
            raise RuntimeError("Please install python-docx: pip install python-docx") from e
        doc = Document(str(path))
        paras = [p.text for p in doc.paragraphs]
        return "\n".join(paras)
    elif path.suffix.lower() in {".txt", ".md"}:
        return path.read_text(encoding="utf-8", errors="ignore")
    else:
        raise RuntimeError(f"Unsupported file type: {path.suffix}. Use .docx or .txt/.md")

def segment_text(text: str, chunk_size: int = 1000, overlap: int = 180) -> List[str]:
    """Segment plain text by characters with overlap."""
    text = re.sub(r"\r\n?", "\n", text)
    n = len(text)
    chunks: List[str] = []
    i = 0
    while i < n:
        end = min(i + chunk_size, n)
        chunk = text[i:end]
        chunks.append(chunk)
        if end >= n:
            break
        i = max(0, end - overlap)
    return chunks

def jaccard(a: str, b: str) -> float:
    """Simple set overlap over word tokens."""
    sa = set(re.findall(r"\w+", a.lower()))
    sb = set(re.findall(r"\w+", b.lower()))
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / max(1, len(sa | sb))

def extract_first_json(s: str) -> Optional[dict]:
    """Extract the first valid JSON object from a free-form LLM output."""
    # fenced block first
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", s, re.S)
    if fence:
        try:
            return json.loads(fence.group(1))
        except Exception:
            pass
    # fallback: brace balance scan
    start_idxs = [m.start() for m in re.finditer(r"\{", s)]
    for start in start_idxs:
        depth = 0
        for i in range(start, len(s)):
            if s[i] == "{":
                depth += 1
            elif s[i] == "}":
                depth -= 1
                if depth == 0:
                    snippet = s[start:i+1]
                    try:
                        return json.loads(snippet)
                    except Exception:
                        break
    return None

def ensure_state_keys(state: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure required arrays exist to avoid KeyErrors in merging."""
    keys = ["characters", "locations", "items", "events", "relations", "unresolved"]
    for k in keys:
        state.setdefault(k, [])
    return state

def normalize_name(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())

# ------------------------------
# Merging Logic
# ------------------------------
def merge_entities_by_key(
    prev: List[Dict[str, Any]],
    new: List[Dict[str, Any]],
    key_fields: List[str],
    text_fields_for_sim: Optional[List[str]] = None,
    sim_threshold: float = 0.7
) -> List[Dict[str, Any]]:
    """Merge entity arrays by exact key match or text-similarity (Jaccard)."""
    if text_fields_for_sim is None:
        text_fields_for_sim = []
    result = list(prev)  # shallow copy
    for cand in new:
        matched = -1
        for idx, ex in enumerate(result):
            # exact key match?
            key_match = True
            for k in key_fields:
                if ex.get(k) is None or cand.get(k) is None:
                    key_match = False
                    break
                if normalize_name(str(ex.get(k))) != normalize_name(str(cand.get(k))):
                    key_match = False
                    break
            if key_match:
                matched = idx
                break
            # fallback: similarity over text fields
            if text_fields_for_sim:
                sim = 0.0
                for tf in text_fields_for_sim:
                    sim = max(sim, jaccard(str(ex.get(tf, "")), str(cand.get(tf, ""))))
                if sim >= sim_threshold:
                    matched = idx
                    break
        if matched >= 0:
            merged = merge_two_entity(result[matched], cand)
            result[matched] = merged
        else:
            result.append(cand)
    return result

def merge_two_entity(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    """Field-wise merge with some special handling."""
    out = dict(a)
    for k, v in b.items():
        if k not in out or out[k] in (None, "", [], {}):
            out[k] = v
        elif k == "aliases" and isinstance(out.get(k), list) and isinstance(v, list):
            out[k] = sorted(list({*map(str, out[k]), *map(str, v)}))
        elif k == "confidence":
            try:
                out[k] = max(float(out.get(k, 0) or 0), float(v or 0))
            except Exception:
                out[k] = out.get(k, v)
        elif k == "first_appearance":
            try:
                out[k] = a.get(k) if parse_span_rank(a.get(k)) <= parse_span_rank(v) else v
            except Exception:
                pass
        else:
            # keep existing
            pass
    return out

def parse_span_rank(span: Optional[str]) -> int:
    """Extract a numeric rank from spans like 'L23-L31' (lower is earlier)."""
    if not span:
        return 10**9
    m = re.search(r"L(\d+)", span)
    if m:
        return int(m.group(1))
    return 10**9

def merge_events(prev: List[Dict[str, Any]], new: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge events by similarity over summary and actors; keep earliest order/evidence."""
    result = list(prev)
    for e in new:
        matched = -1
        for i, ex in enumerate(result):
            sim = max(
                jaccard(str(ex.get("summary", "")), str(e.get("summary", ""))),
                jaccard(" ".join(ex.get("actors", []) or []), " ".join(e.get("actors", []) or []))
            )
            if sim >= 0.6:
                matched = i
                break
        if matched >= 0:
            merged = merge_two_entity(result[matched], e)
            for k in ["location", "iso_time", "relative_time", "evidence_span", "title"]:
                if not merged.get(k) and e.get(k):
                    merged[k] = e[k]
            try:
                aord = int(result[matched].get("order", 10**9))
                bord = int(e.get("order", 10**9))
                merged["order"] = min(aord, bord)
            except Exception:
                pass
            result[matched] = merged
        else:
            result.append(e)

    def _order_key(ev: Dict[str, Any]):
        try:
            return (int(ev.get("order", 10**9)), parse_span_rank(ev.get("evidence_span")))
        except Exception:
            return (10**9, 10**9)

    result.sort(key=_order_key)
    return result

def merge_relations(prev: List[Dict[str, Any]], new: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate (subject, predicate, object) triples by normalized tuple."""
    seen = set()
    out: List[Dict[str, Any]] = []
    for rel in prev + new:
        key = (
            normalize_name(str(rel.get("subject", ""))),
            normalize_name(str(rel.get("predicate", ""))),
            normalize_name(str(rel.get("object", "")))
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(rel)
    return out

def merge_unresolved(prev: List[Dict[str, Any]], new: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate unresolved Q&A by (question, set(hypotheses))."""
    out: List[Dict[str, Any]] = []
    seen = set()
    def _key(it: Dict[str, Any]):
        q = normalize_name(str(it.get("question","")))
        hyps = tuple(sorted(normalize_name(h) for h in (it.get("hypotheses") or [])))
        return (q, hyps)
    for it in (prev or []) + (new or []):
        k = _key(it)
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out

def merge_states(prev: Dict[str, Any], cur: Dict[str, Any]) -> Dict[str, Any]:
    """Master state merge: entities, events, relations, unresolved."""
    prev = ensure_state_keys(prev or {})
    cur  = ensure_state_keys(cur  or {})
    merged: Dict[str, Any] = {}
    merged["characters"] = merge_entities_by_key(prev["characters"], cur["characters"],
                                                key_fields=["name"],
                                                text_fields_for_sim=["description", "role"],
                                                sim_threshold=0.7)
    merged["locations"]  = merge_entities_by_key(prev["locations"],  cur["locations"],
                                                key_fields=["name", "type"],
                                                text_fields_for_sim=["description"],
                                                sim_threshold=0.7)
    merged["items"]      = merge_entities_by_key(prev["items"],      cur["items"],
                                                key_fields=["name", "category"],
                                                text_fields_for_sim=["description"],
                                                sim_threshold=0.7)
    merged["events"]     = merge_events(prev["events"], cur["events"])
    merged["relations"]  = merge_relations(prev["relations"], cur["relations"])
    merged["unresolved"] = merge_unresolved(prev["unresolved"], cur["unresolved"])
    return merged

# ------------------------------
# LLM Clients
# ------------------------------
class LLMClient:
    def infer(self, system_prompt: str, user_prompt: str, max_retries: int = 2) -> Dict[str, Any]:
        raise NotImplementedError

class OllamaClient(LLMClient):
    def __init__(self, model_name: str = "llama3.1", host: str = "http://localhost:11434"):
        self.model_name = model_name
        self.host = host.rstrip("/")
        try:
            import requests  # noqa: F401
        except Exception as e:
            raise RuntimeError("Please install requests: pip install requests") from e

    def infer(self, system_prompt: str, user_prompt: str, max_retries: int = 2) -> Dict[str, Any]:
        import requests
        url = f"{self.host}/api/generate"
        body = {
            "model": self.model_name,
            "prompt": f"<|system|>\n{system_prompt}\n<|user|>\n{user_prompt}\n<|assistant|>",
            "stream": False,
            "options": {"temperature": 0.2}
        }
        last_text = ""
        for _ in range(max_retries):
            resp = requests.post(url, json=body, timeout=300)
            resp.raise_for_status()
            data = resp.json()
            text = data.get("response", "") or ""
            last_text = text
            obj = extract_first_json(text)
            if obj is not None:
                return obj
            time.sleep(0.5)
        raise RuntimeError("Model did not return valid JSON. Partial response:\n" + (last_text[:1000] if last_text else ""))

class MockLLMClient(LLMClient):
    """Simple deterministic mock for local testing without any LLM backend."""
    def infer(self, system_prompt: str, user_prompt: str, max_retries: int = 1) -> Dict[str, Any]:
        m_doc   = re.search(r"doc_id:\s*(.+)", user_prompt)
        m_chunk = re.search(r"chunk_id:\s*(\d+)", user_prompt)
        m_total = re.search(r"total_chunks:\s*(\d+)", user_prompt)
        m_span  = re.search(r"chunk_span:\s*(.+)", user_prompt)
        doc_id       = (m_doc.group(1).strip() if m_doc else "demo").splitlines()[0]
        chunk_id     = int(m_chunk.group(1)) if m_chunk else 0
        total_chunks = int(m_total.group(1)) if m_total else 1
        span         = (m_span.group(1).strip() if m_span else "L1-L999").splitlines()[0]
        m_text       = re.search(r"\[TEXT_CHUNK\]\n(.*)\Z", user_prompt, re.S)
        chunk_text   = m_text.group(1).strip() if m_text else ""

        loc_name = None
        if re.search(r"(ancient\s+roman\s+ruin|roman\s+ruins)", chunk_text, re.I):
            loc_name = "Ancient Roman Ruin"

        items: List[Dict[str, Any]] = []
        if re.search(r"prize|award|trophy|奖品", chunk_text, re.I):
            items.append({
                "id": f"item_{chunk_id:03d}",
                "name": "special prize",
                "category": "artifact",
                "first_appearance": span,
                "description": None,
                "confidence": 0.6
            })

        characters: List[Dict[str, Any]] = [
            {
                "id": f"char_{chunk_id:03d}_01",
                "name": "Unknown Character #1",
                "aliases": [],
                "role": "seeker",
                "first_appearance": span,
                "description": "The person trying to obtain the prize",
                "confidence": 0.55
            }
        ]
        if re.search(r"\bsomeone\b|\bhe\b|\bshe\b|他|她", chunk_text, re.I):
            characters.append({
                "id": f"char_{chunk_id:03d}_02",
                "name": "Unknown Character #2",
                "aliases": [],
                "role": "prize holder",
                "first_appearance": span,
                "description": "The person being persuaded to give the prize",
                "confidence": 0.5
            })

        locations: List[Dict[str, Any]] = []
        if loc_name:
            locations.append({
                "id": f"loc_{chunk_id:03d}",
                "name": loc_name,
                "type": "site",
                "first_appearance": span,
                "description": "Story location",
                "confidence": 0.9
            })

        events: List[Dict[str, Any]] = []
        if re.search(r"clue|puzzle|trap|线索|陷阱", chunk_text, re.I):
            events.append({
                "id": f"ev_{chunk_id:03d}",
                "order": chunk_id + 1,
                "title": "Solve clues to pass the trap",
                "actors": [characters[0]["id"]],
                "location": locations[0]["id"] if locations else None,
                "iso_time": None,
                "relative_time": None,
                "summary": "The seeker must decipher clues to pass a trap and approach the prize.",
                "evidence_span": span,
                "confidence": 0.8
            })

        relations: List[Dict[str, Any]] = []
        if items and locations:
            relations.append({
                "id": f"rel_{chunk_id:03d}",
                "subject": items[0]["id"],
                "predicate": "located_in",
                "object": locations[0]["id"],
                "evidence_span": span,
                "confidence": 0.5
            })

        unresolved: List[Dict[str, Any]] = []
        if any("Unknown Character #2" == c["name"] for c in characters):
            unresolved.append({
                "question": "Who is holding the prize?",
                "hypotheses": ["a guardian", "a site warden", "the puzzle setter"],
                "evidence_span": span
            })

        summary_en = (
            "This chunk introduces a seeker aiming for a special prize, "
            "hints of clues inscribed on walls, and a trap that must be bypassed, "
            "likely within an ancient Roman ruin."
        )
        out = {
            "doc_id": doc_id,
            "chunk_id": chunk_id,
            "state": {
                "characters": characters,
                "locations": locations,
                "items": items,
                "events": events,
                "relations": relations,
                "unresolved": unresolved
            },
            "summary_en": summary_en,
            "normalized_notes": [
                "No explicit names provided; temporary 'Unknown Character #' labels used.",
                "Use the exact site name from text whenever available."
            ]
        }
        return out

# ------------------------------
# CSV Export
# ------------------------------
def export_csvs(state: Dict[str, Any], outdir: Path) -> None:
    outdir.mkdir(parents=True, exist_ok=True)

    def write_csv(name: str, rows: List[Dict[str, Any]], headers: List[str]) -> None:
        p = outdir / f"{name}.csv"
        with p.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)

    ch = state.get("characters", [])
    write_csv("Characters", ch, ["id", "name", "aliases", "role", "first_appearance", "description", "confidence"])

    loc = state.get("locations", [])
    write_csv("Locations", loc, ["id", "name", "type", "first_appearance", "description", "confidence"])

    it = state.get("items", [])
    write_csv("Items", it, ["id", "name", "category", "first_appearance", "description", "confidence"])

    ev = state.get("events", [])
    write_csv("Events", ev, ["id", "order", "title", "actors", "location", "iso_time", "relative_time", "summary", "evidence_span", "confidence"])

    rel = state.get("relations", [])
    write_csv("Relations", rel, ["id", "subject", "predicate", "object", "evidence_span", "confidence"])

    un = state.get("unresolved", [])
    write_csv("Unresolved", un, ["question", "hypotheses", "evidence_span"])

# ------------------------------
# Main Pipeline
# ------------------------------
def run_pipeline(input_path: Path, model: str, model_name: Optional[str], chunk_size: int, overlap: int, outdir: Path) -> None:
    full_text = read_text_from_file(input_path)
    chunks = segment_text(full_text, chunk_size=chunk_size, overlap=overlap)
    doc_id = input_path.stem
    total_chunks = len(chunks)

    if model == "ollama":
        client = OllamaClient(model_name=model_name or "llama3.1")
    elif model == "mock":
        client = MockLLMClient()
    else:
        raise RuntimeError("model must be one of: ollama | mock")

    merged_state: Dict[str, Any] = {"characters": [], "locations": [], "items": [], "events": [], "relations": [], "unresolved": []}
    last_summary = ""

    for i, chunk in enumerate(chunks):
        prev_state_json = json.dumps(merged_state, ensure_ascii=False)
        # span is a best-effort character range in the original text
        start_idx = max(0, i * (chunk_size - overlap))
        end_idx   = min(len(full_text), start_idx + len(chunk))
        span = f"char[{start_idx}:{end_idx}]"

        user_prompt = USER_PROMPT_TEMPLATE.format(
            doc_id=doc_id,
            chunk_id=i,
            total_chunks=total_chunks,
            chunk_span=span,
            previous_state=prev_state_json,
            json_schema=json.dumps(SCHEMA, ensure_ascii=False),
            chunk_text=chunk
        )

        obj = client.infer(SYSTEM_PROMPT, user_prompt, max_retries=2)
        if not isinstance(obj, dict) or "state" not in obj:
            raise RuntimeError(f"Invalid object from chunk {i}")

        cur_state = ensure_state_keys(obj.get("state") or {})
        merged_state = merge_states(merged_state, cur_state)
        last_summary = obj.get("summary_en", "") or last_summary
        print(f"[OK] chunk {i+1}/{total_chunks} processed")

    outdir.mkdir(parents=True, exist_ok=True)
    final_obj = {
        "doc_id": doc_id,
        "total_chunks": total_chunks,
        "state": merged_state,
        "summary_en": last_summary
    }
    json_path = outdir / f"{doc_id}_final.json"
    json_path.write_text(json.dumps(final_obj, ensure_ascii=False, indent=2), encoding="utf-8")
    export_csvs(merged_state, outdir)
    print(f"[DONE] JSON: {json_path}")
    print(f"[DONE] CSVs written to: {outdir.resolve()}")

def main() -> None:
    p = argparse.ArgumentParser(description="Narrative Information Extraction & Summarization (Unified)")
    p.add_argument("--input", required=True, help="Path to .docx or .txt/.md file")
    p.add_argument("--model", default="mock", choices=["ollama", "mock"], help="LLM client (default mock for local testing)")
    p.add_argument("--model-name", default="llama3.1", help="Ollama model name (only when --model ollama)")
    p.add_argument("--chunk-size", type=int, default=1000, help="Chunk size in characters")
    p.add_argument("--overlap", type=int, default=180, help="Overlap size in characters")
    p.add_argument("--outdir", default="./output", help="Output directory")
    args = p.parse_args()

    input_path = Path(args.input)
    outdir = Path(args.outdir)
    run_pipeline(input_path, args.model, args.model_name, args.chunk_size, args.overlap, outdir)

if __name__ == "__main__":
    main()
