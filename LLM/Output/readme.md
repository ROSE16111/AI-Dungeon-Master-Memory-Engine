# Narrative Driver (Unified) — Narrative Information Extraction & Summarization

A single-file pipeline that **chunks long documents**, asks an **LLM** (Ollama local model or a mock), and **merges structured entities** across chunks. It exports a final **JSON** plus convenient **CSVs** for characters, locations, items, events, relations, and unresolved questions.

> File: `narrative_driver_unified.py` (English-only output)

---

## ✨ Features

- **Input formats**: `.docx`, `.txt`, `.md`
- **Chunking**: character-based with overlap for better context continuity
- **LLM backends**: 
  - `ollama` → calls local Ollama `/api/generate`
  - `mock` → deterministic, offline testing (no LLM required)
- **Merging**: robust de-duplication & field-wise merge for entities/events/relations/unresolved
- **Outputs**:
  - `<doc_id>_final.json` (cumulative state + last `summary_en`)
  - CSVs: `Characters.csv`, `Locations.csv`, `Items.csv`, `Events.csv`, `Relations.csv`, `Unresolved.csv`

---

## 📦 Requirements

- Python 3.9+
- For `.docx` input: `python-docx`
- For `ollama` backend: `requests` and a running **Ollama** service (default `http://localhost:11434`)

Install the minimal extras:
```bash
pip install python-docx requests
```

> If you only use the `mock` backend with `.txt/.md`, you can skip `python-docx`.

---

## 🚀 Quickstart

```bash
# 1) Use local Ollama model (recommended: llama3.1)
python narrative_driver_unified.py \
  --input story.docx \
  --model ollama \
  --model-name llama3.1 \
  --chunk-size 1000 \
  --overlap 180 \
  --outdir ./output

# 2) Use mock (no LLM, fast local sanity check)
python narrative_driver_unified.py \
  --input story.txt \
  --model mock \
  --outdir ./output
```

**Expected outputs** in `./output`:
- `story_final.json`  
- `Characters.csv`, `Locations.csv`, `Items.csv`, `Events.csv`, `Relations.csv`, `Unresolved.csv`

During processing you’ll see progress logs like:
```
[OK] chunk 1/8 processed
[OK] chunk 2/8 processed
...
[DONE] JSON: output/story_final.json
[DONE] CSVs written to: /abs/path/to/output
```

---

## ⚙️ CLI Arguments

```bash
python narrative_driver_unified.py --input <file> \
  --model {ollama|mock} \
  --model-name <ollama_model_name> \
  --chunk-size 1000 \
  --overlap 180 \
  --outdir ./output
```

| Argument        | Type/Values            | Default      | Description |
|-----------------|------------------------|--------------|-------------|
| `--input`       | path to `.docx/.txt/.md` | **required** | Input document path. |
| `--model`       | `ollama` \| `mock`     | `mock`       | LLM backend: use `ollama` for real inference, `mock` for offline testing. |
| `--model-name`  | string                 | `llama3.1`   | Ollama model name (only used when `--model ollama`). |
| `--chunk-size`  | int                    | `1000`       | Chunk size **in characters**. |
| `--overlap`     | int                    | `180`        | Character overlap between chunks (for context carry-over). |
| `--outdir`      | path                   | `./output`   | Output directory for JSON and CSVs. |

---

## 🧠 What the model is asked to do

For each chunk, the script sends a **system prompt** + **user prompt** that instructs the model to:
- Extract a **strict JSON object** with fields: `characters`, `locations`, `items`, `events`, `relations`, `unresolved` (plus `doc_id`, `chunk_id`, `summary_en`, etc.).  
- Avoid hallucinations; provide evidence spans if possible.  
- Provide an English plot summary (`summary_en`) per chunk.  

Then the script **merges** each chunk’s state into a cumulative state using similarity-based and key-based rules.

---

## 📤 Output files

### 1) Final JSON — `<doc_id>_final.json`
```json
{
  "doc_id": "story",
  "total_chunks": 8,
  "state": {
    "characters": [ ... ],
    "locations":  [ ... ],
    "items":      [ ... ],
    "events":     [ ... ],
    "relations":  [ ... ],
    "unresolved": [ ... ]
  },
  "summary_en": "Final English summary based on the latest chunk"
}
```

### 2) CSVs (one table per entity type)
- `Characters.csv`: `id, name, aliases, role, first_appearance, description, confidence`
- `Locations.csv`:  `id, name, type, first_appearance, description, confidence`
- `Items.csv`:      `id, name, category, first_appearance, description, confidence`
- `Events.csv`:     `id, order, title, actors, location, iso_time, relative_time, summary, evidence_span, confidence`
- `Relations.csv`:  `id, subject, predicate, object, evidence_span, confidence`
- `Unresolved.csv`: `question, hypotheses, evidence_span`

> CSVs are exported with UTF‑8 encoding and headers.

---

## 🔧 Tips & Tuning

- **Chunking**: Increase `--chunk-size` for fewer calls (faster), but don’t make it too large—longer chunks can reduce model precision and cost more time per request.  
- **Overlap**: `--overlap` keeps context continuity across boundaries; 120–200 works well for many narratives.  
- **Model choice** (`ollama`): Start with `llama3.1`; if outputs are too verbose or not JSON-clean, try adjusting Ollama options or a different model.  
- **Mock mode**: Use `--model mock` to verify end‑to‑end flow (I/O, merging, CSV export) without any LLM.

---

## 🐞 Troubleshooting

- **`Please install python-docx`**  
  - You provided a `.docx` but don’t have the package. Run:  
    `pip install python-docx`

- **`requests` missing / connection errors to Ollama**  
  - Install: `pip install requests`  
  - Ensure Ollama is running locally:  
    ```bash
    ollama serve
    ollama run llama3.1
    ```
  - Default endpoint is `http://localhost:11434`. If you run Ollama elsewhere, modify the `OllamaClient` host in the code.

- **Model returned non‑JSON**  
  - The script retries and attempts to extract the first JSON block. If failures persist:  
    - Try a different model or reduce chunk size.  
    - Confirm the model supports instruction following and structured output.  
    - Inspect raw response for formatting issues.

- **CSV looks empty or entities missing**  
  - The merge rules de‑duplicate by key/similarity. If your model’s entity IDs or names are inconsistent, try smaller chunks or tune prompt/model.

---

## 🧩 Integration idea: load into a database (Prisma/SQLite/Postgres)

You can convert the final JSON into a relational database using the companion **Prisma converter** (we provided a separate pack with `schema.prisma` and a TS import script). If you need that bundle again, let me know and I’ll put it next to this project.

---

## 📄 License

MIT (use freely, keep the notice).
