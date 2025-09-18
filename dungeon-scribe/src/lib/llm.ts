// lib/llm.ts

// ── Env ────────────────────────────────────────────────────────────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi3:medium";

// Optional tuning via env:
const LLM_CONCURRENCY = Number(process.env.LLM_CONCURRENCY ?? 3); // parallel chunks
const LLM_NUM_CTX     = Number(process.env.LLM_NUM_CTX ?? 4096);
const LLM_NUM_PREDICT = Number(process.env.LLM_NUM_PREDICT ?? 256);
const TEMP = 0.1;

// ── Chunking parameters ────────────────────────────────────────────────────────
const LONG_THRESHOLD_WORDS = 1000;  // if transcript ≤ this, do single-pass
const CHUNK_TEXT    = Number(process.env.CHUNK_TEXT ?? 700);
const CHUNK_OVERLAP = 70;           // overlapping words between chunks
const MERGE_BATCH   = 6;            // summaries per merge group

// ── Utils ─────────────────────────────────────────────────────────────────────
function splitIntoChunks(text: string, size = CHUNK_TEXT, overlap = CHUNK_OVERLAP): string[] {
  const words = text.trim().split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += Math.max(1, size - overlap)) {
    const slice = words.slice(i, i + size);
    if (!slice.length) break;
    chunks.push(slice.join(" "));
    if (i + size >= words.length) break;
  }
  return chunks;
}

function normalizeBullets(s: string): string {
  return s
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => (l.startsWith("•") ? l : `• ${l}`))
    .join("\n");
}

// ── Core LLM call (Ollama /generate) ──────────────────────────────────────────
async function callLLM(prompt: string, label: string): Promise<string> {
  console.time(label);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: TEMP,
          num_ctx: LLM_NUM_CTX,
          num_predict: LLM_NUM_PREDICT, // keep responses snappy
          keep_alive: "15m",            // keep model resident between calls
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama API error: ${res.status} ${res.statusText} — ${body}`);
    }

    const data = await res.json();
    const out = (data.response ?? "").trim();
    console.timeEnd(label);
    return out;
  } catch (err: any) {
    console.timeEnd(label);
    console.error(`${label}_ERROR`, { msg: err?.message, code: err?.code, name: err?.name });
    throw err;
  }
}

// ── Prompts ───────────────────────────────────────────────────────────────────
function singlePassPrompt(text: string): string {
  return `You are a faithful note-taker for a Dungeons & Dragons session.

MODE: VERBATIM-ONLY RECAP
- Use ONLY facts explicitly present in the transcript.
- Never invent names, items, quests, places, mechanics, or outcomes.
- If something is unclear or missing, omit it.

OUTPUT:
- 5–8 bullets, each starting with "• ".
- Short, factual bullets. Focus (if stated): plot beats, explicit NPC names/roles, locations visited,
  items gained/lost, important player decisions & consequences, hooks/next steps.

TRANSCRIPT:
${text}`;
}

function chunkPrompt(chunk: string, idx: number, total: number): string {
  return `You are a precise D&D session scribe.

CHUNK ${idx + 1} OF ${total} — MODE: VERBATIM-ONLY
- Use ONLY facts in THIS CHUNK.
- No speculation or new info.
- Keep proper nouns exactly as written.

OUTPUT:
- 3–6 bullets, each starting with "• ".
- Short, factual bullets focusing on plot beats, explicit NPC names/roles, locations, items, decisions/consequences.

CHUNK TEXT:
${chunk}`;
}

function mergePrompt(summaries: string[]): string {
  return `Combine the given D&D chunk summaries into ONE faithful recap.

MODE: VERBATIM-ONLY MERGE
- Use ONLY facts in the chunk summaries below.
- De-duplicate, keep chronological flow.
- If two bullets contradict, keep the clearer one; do not speculate.

OUTPUT:
- ≤10 bullets, each starting with "• ".
- No headings or numbering—bullets only.

CHUNK SUMMARIES:
${summaries.map((s, i) => `--- CHUNK ${i + 1} ---\n${s}`).join("\n")}

FINAL SUMMARY (bullets only):`;
}

// ── Summarization steps ───────────────────────────────────────────────────────
async function summarizeChunk(chunk: string, idx: number, total: number): Promise<string> {
  const out = await callLLM(chunkPrompt(chunk, idx, total), `LLM_chunk_${idx + 1}/${total}`);
  return normalizeBullets(out);
}

async function mergeSummaries(summaries: string[]): Promise<string> {
  const out = await callLLM(mergePrompt(summaries), "LLM_merge");
  return normalizeBullets(out);
}

async function hierarchicalMerge(summaries: string[]): Promise<string> {
  let layer = summaries.slice();
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += MERGE_BATCH) {
      const group = layer.slice(i, i + MERGE_BATCH);
      const merged = await mergeSummaries(group);
      next.push(merged.trim());
    }
    layer = next;
  }
  return layer[0] ?? "";
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Summarizes a DnD session transcript.
 * - Short text → single pass
 * - Long text → chunk, summarize in parallel (bounded), then merge
 */
export async function summarizeDnDSession(rawText: string): Promise<string> {
  const text = (rawText ?? "").trim();
  if (!text) return "";

  const wordCount = text.split(/\s+/).length;

  // Single-pass (faster) for short inputs
  if (wordCount <= LONG_THRESHOLD_WORDS) {
    const out = await callLLM(singlePassPrompt(text), "LLM_single");
    return normalizeBullets(out);
  }

  // Chunk & summarize in bounded parallel
  const chunks = splitIntoChunks(text);
  const miniSummaries: string[] = [];

  for (let i = 0; i < chunks.length; i += LLM_CONCURRENCY) {
    const batch = chunks.slice(i, i + LLM_CONCURRENCY);
    const outs = await Promise.allSettled(
      batch.map((c, j) => summarizeChunk(c, i + j, chunks.length))
    );
    for (const o of outs) {
      if (o.status === "fulfilled" && o.value) miniSummaries.push(o.value);
    }
  }

  // If all chunk calls failed, fallback to a clipped single-pass
  if (miniSummaries.length === 0) {
    const clipped = text.split(/\s+/).slice(0, CHUNK_TEXT).join(" ");
    const out = await callLLM(singlePassPrompt(clipped + "\n\n[Note: clipped]"), "LLM_fallback_single");
    return normalizeBullets(out);
  }

  // Merge layer-by-layer
  try {
    const merged = await hierarchicalMerge(miniSummaries);
    if (merged) return merged.trim();
  } catch {
    // fall through to simple join
  }

  // Last resort: join partials and trim length
  const joined = miniSummaries.join("\n");
  const trimmed = joined.length > 4000 ? joined.slice(0, 4000) + "\n…" : joined;
  return trimmed;
}
