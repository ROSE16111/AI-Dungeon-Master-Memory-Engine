// lib/llm.ts

// ── Env ────────────────────────────────────────────────────────────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi3:medium";

// Optional tuning via env:
const LLM_CONCURRENCY = 2;
const LLM_NUM_CTX     = 4096;
const LLM_NUM_PREDICT = 160;
const TEMP = 0.1;

// ── Chunking parameters ────────────────────────────────────────────────────────
const LONG_THRESHOLD_WORDS = 1000;  
const CHUNK_TEXT    = 500;
const CHUNK_OVERLAP = 50;         
const MERGE_BATCH   = 6;   
const LLM_NUM_PREDICT_MERGE = 1024;   

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

/**
 * Normalize LLM output into Markdown mini-sections:
 * Ensures every section starts with "### " and has a short paragraph after it.
 */
function normalizeSections(s: string): string {
  const lines = (s ?? "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  // If the model returned bullets, coerce into sections.
  const looksLikeBullets = lines.every(l => /^[-*•]\s+/.test(l));
  if (looksLikeBullets) {
    return lines
      .map((l, i) => {
        const text = l.replace(/^[-*•]\s+/, "").trim();
        return `### ${text}\n${i === 0 ? "" : ""}`;
      })
      .join("\n");
  }

  // Pass-through if headings already present.
  const hasHeadings = lines.some(l => /^#{2,6}\s/.test(l));
  if (hasHeadings) {
    // Downgrade any H2/H4/etc. to H3 for consistency and collapse extra blank lines.
    const fixed = lines
      .map(l => l.replace(/^#{2,6}\s+/, m => "### "))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return fixed;
  }

  // Otherwise, create a single section with the whole content.
  return `### Recap\n${lines.join(" ")}`;
}

// ── Core LLM call (Ollama /generate) ──────────────────────────────────────────
async function callLLM(prompt: string, label: string, numPredict = LLM_NUM_PREDICT): Promise<string> {
  console.time(label);
  const ac = new AbortController();
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: true,                 // <— stream!
        options: {
          temperature: TEMP,
          num_ctx: LLM_NUM_CTX,
          num_predict: numPredict,
          keep_alive: "15m",
        },
      }),
      signal: ac.signal,
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama API error: ${res.status} ${res.statusText} — ${body}`);
    }

    // Read streaming JSON lines from Ollama
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let out = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      // Ollama streams newline-delimited JSON objects
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (typeof msg.response === "string") out += msg.response;
        } catch {
          // ignore partial JSON
        }
      }
    }

    console.timeEnd(label);
    return out.trim();
  } catch (err) {
    console.timeEnd(label);
    console.error(`${label}_ERROR`, { msg: (err as any)?.message, name: (err as any)?.name });
    throw err;
  }
}

// ── Prompts (Plain Title + Paragraph blocks) ──────────────────────────────────
function singlePassPrompt(text: string): string {
  return `You are a faithful note-taker for a Dungeons & Dragons session.

MODE: VERBATIM-ONLY RECAP
- Use ONLY facts explicitly present in the transcript.
- Never invent names, items, quests, places, mechanics, or outcomes.
- If something is unclear or missing, omit it.

OUTPUT FORMAT (PLAIN TEXT, NO MARKDOWN):
- Write 4–8 sections.
- Each section MUST be:
  Line 1: A SHORT TITLE on its own line (no hashes, no numbers, no bullets).
  Line 2..3: 1–3 sentences of concise prose describing only facts from the text.
- Put ONE blank line between sections.
- Do NOT use lists or bullets. Do NOT add "###" or any other heading markup.
- Keep proper nouns exactly as written.

TRANSCRIPT:
${text}`;
}

function chunkPrompt(chunk: string, idx: number, total: number): string {
  return `You are a precise D&D session scribe.

CHUNK ${idx + 1} OF ${total} — MODE: VERBATIM-ONLY
- Use ONLY facts in THIS CHUNK.
- No speculation or new info.
- Keep proper nouns exactly as written.

OUTPUT FORMAT (PLAIN TEXT, NO MARKDOWN):
- Write 2–4 sections for THIS CHUNK.
- Each section MUST be:
  Line 1: SHORT TITLE
  Line 2..3: 1–3 factual sentences
- Blank line between sections. No bullets, no numbering, no "###".

CHUNK TEXT:
${chunk}`;
}

function mergePrompt(summaries: string[]): string {
  return `Combine the given D&D chunk summaries into ONE faithful recap.

MODE: VERBATIM-ONLY MERGE
- Use ONLY facts in the chunk summaries below.
- De-duplicate, keep chronological flow.
- If two statements contradict, keep the clearer one; do not speculate.

OUTPUT FORMAT (PLAIN TEXT, NO MARKDOWN):
- Write 4–10 sections total.
- Each section MUST be:
  Line 1: SHORT TITLE (no hashes, bullets, or numbers)
  Line 2..3: 1–3 factual sentences
- One blank line between sections.

CHUNK SUMMARIES:
${summaries.map((s, i) => `--- CHUNK ${i + 1} ---\n${s}`).join("\n")}

FINAL RECAP (plain title + paragraph blocks only):`;
}

// ── Normalizer: coerce any bullets/markdown into Title+Paragraph blocks ───────
function normalizeBlocks(s: string): string {
  const raw = (s ?? "").trim();
  if (!raw) return "";

  // If the model used markdown headings, strip them.
  const lines = raw.replace(/^#{1,6}\s+/gm, "").split(/\r?\n/);

  // If the model used bullets, fold each bullet into its own "Title\n…" block.
  const isAllBullets = lines.filter(Boolean).every(l => /^[-*•]\s+/.test(l));
  if (isAllBullets) {
    return lines
      .filter(Boolean)
      .map(l => l.replace(/^[-*•]\s+/, ""))
      .map((t, i) => `${t.split(/[.?!]\s/)[0] || "Note"}\n${t}`)
      .join("\n\n");
  }

  // Collapse triple+ newlines, trim, ensure single blank line between paragraphs
  const tidy = lines
    .map(l => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // If there are no blank lines at all, try to split into pseudo sections by
  // detecting sentence starts with capital letters after a period.
  if (!/\n{2,}/.test(tidy)) {
    const parts = tidy.split(/(?:\.\s+)(?=[A-Z"“])/).filter(Boolean);
    if (parts.length > 1) {
      return parts
        .map((p, i) => {
          const title = (p.split("\n")[0] || `Section ${i + 1}`).slice(0, 60);
          return `${title}\n${p}${p.endsWith(".") ? "" : "."}`;
        })
        .join("\n\n");
    }
  }

  return tidy;
}

// ── Summarization steps ───────────────────────────────────────────────────────
async function summarizeChunk(chunk: string, idx: number, total: number): Promise<string> {
  const out = await callLLM(chunkPrompt(chunk, idx, total), `LLM_chunk_${idx + 1}/${total}`);
  return normalizeBlocks(out);
}

async function mergeSummaries(summaries: string[]): Promise<string> {
  const out = await callLLM(mergePrompt(summaries), "LLM_merge", LLM_NUM_PREDICT_MERGE);
  return normalizeBlocks(out);
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
 * Summarizes a DnD session transcript into mini-headings + short paragraphs (Markdown).
 * - Short text → single pass
 * - Long text → chunk, summarize in parallel (bounded), then merge
 */
export async function summarizeDnDSession(rawText: string): Promise<string> {
  const text = (rawText ?? "").trim();
  if (!text) return "";
  const wordCount = text.split(/\s+/).length;

  if (wordCount <= LONG_THRESHOLD_WORDS) {
    const out = await callLLM(singlePassPrompt(text), "LLM_single");
    return normalizeBlocks(out);
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
    const out = await callLLM(
      singlePassPrompt(clipped + "\n\n[Note: clipped]"),
      "LLM_fallback_single"
    );
    return normalizeSections(out);
  }

  // Merge layer-by-layer
  try {
    const merged = await hierarchicalMerge(miniSummaries);
    if (merged) return merged.trim();
  } catch {
    // fall through to simple join
  }

  // Last resort: join partials and trim length
  const joined = miniSummaries.join("\n\n");
  const trimmed = joined.length > 4000 ? joined.slice(0, 4000) + "\n…" : joined;
  console.log(trimmed)
  return trimmed;
}
