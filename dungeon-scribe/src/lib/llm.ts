// Thresholds and hyperparameters for splitting, summarizing, and merging.
// Values are tuned for short, factual recaps rather than creative writing.
const LONG_THRESHOLD_WORDS = 1000;  // Single-pass summarization below this word count
const CHUNK_TEXT = 700;             // Approximate words per chunk for long transcripts
const CHUNK_OVERLAP = 70;           // Overlap preserves context at chunk boundaries
const TEMP = 0.1;                   // Low temperature to reduce fabrication
const MERGE_BATCH = 6;              // Number of chunk summaries merged per round

// configurable max duration for a single LLM request (ms)
const LLM_REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 900_000); // 15 min

// bounded network resiliency for streaming fetches
const MAX_RETRIES = Number(process.env.LLM_REQUEST_RETRIES ?? 2); // total attempts = 1 + MAX_RETRIES
const RETRY_BASE_MS = Number(process.env.LLM_RETRY_BASE_MS ?? 1500); // exponential backoff base
const STALL_TIMEOUT_MS = Number(process.env.LLM_STALL_TIMEOUT_MS ?? 60_000); // abort if no bytes arrive for N ms

/**
 * Splits a long transcript into overlapping word-range chunks.
 * Overlap helps keep entities and clauses intact across boundaries.
 *
 * @param text - Full transcript text to split.
 * @param size - Target words per chunk.
 * @param overlap - Words from the end of the previous chunk to repeat at the start of the next.
 * @returns Array of chunk strings.
 */
function splitIntoChunks(
  text: string,
  size = CHUNK_TEXT,
  overlap = CHUNK_OVERLAP
): string[] {
  const words = text.trim().split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    const slice = words.slice(i, i + size);
    if (!slice.length) break;
    chunks.push(slice.join(" "));
    if (i + size >= words.length) break;
  }
  return chunks;
}

/**
 * Low-level Ollama invocation using the REST API.
 * Using fetch keeps the dependency surface small and avoids SDK differences
 * across runtimes like Node, Next.js, and serverless environments.
 */
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi3:medium";

/**
 * Calls the Ollama REST API with a given prompt.
 * Adds basic timing and structured error logging for observability.
 * 
 *
 * @param prompt - Prompt text to send.
 * @param label - Console timer label to identify the request in logs.
 * @returns Raw model response text.
 * @throws Rethrows on non-OK HTTP or network failures.
 */
async function callLLM(prompt: string, label: string): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const attemptLabel = attempt ? `${label} (retry ${attempt})` : label;
    console.time(attemptLabel);

    // abort controller to bound total time on our side (independent of Undici header timeout)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);

    try {
      // request streaming so headers arrive immediately (prevents headers-timeout)
      const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: true,
          options: { temperature: TEMP, num_predict: 220 },
          keep_alive: "30m",
        }),
        signal: controller.signal,  
      });

      if (!res.ok) {
        throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
      }
      if (!res.body) {
        throw new Error("Ollama stream missing response body");
      }

      // read NDJSON stream and append `response` chunks with stall watchdog
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let out = "";

      let lastTick = Date.now();
      const stallTimer = setInterval(() => {
        if (Date.now() - lastTick > STALL_TIMEOUT_MS) {
          clearInterval(stallTimer);
          controller.abort(); // triggers catch -> retry
        }
      }, 5_000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lastTick = Date.now();

          buf += decoder.decode(value, { stream: true });

          // Ollama sends one JSON object per line
          let idx: number;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              const obj = JSON.parse(line);
              if (typeof obj?.response === "string") {
                out += obj.response;
              }
              // break early once Ollama signals completion to avoid tail hangs
              if (obj?.done) {
                await reader.cancel().catch(() => {});
                clearInterval(stallTimer);
                const result = (out ?? "").trim();
                console.timeEnd(attemptLabel);
                clearTimeout(timer);
                controller.abort(); 
                return result;
              }
            } catch {
            
            }
          }
        }
      } finally {
        clearInterval(stallTimer);
      }

      const result = (out ?? "").trim();
      console.timeEnd(attemptLabel);
      clearTimeout(timer);
      controller.abort();
      return result;
    } catch (err: any) {
      console.timeEnd(attemptLabel);
      clearTimeout(timer);

      // retry only on network-ish failures / aborts
      const msg = String(err?.message || "");
      const name = String(err?.name || "");
      const isAbort = name === "AbortError";
      const retryable =
        isAbort ||
        msg.includes("fetch failed") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("socket hang up");

      if (attempt < MAX_RETRIES && retryable) {
        const backoff =
          RETRY_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      console.error(`${label}_ERROR`, {
        msg: err?.message,
        code: err?.code,
        name: err?.name,
      });
      throw err;
    }
  }

  // Should be unreachable (loop either returns or throws earlier)
  throw new Error("exhausted retries");
}

/**
 * Summarizes a single transcript chunk with strict factual constraints.
 * Output is structured as short titled sections to support later merging.
 *
 * CHANGED: wording to prevent literal "Title:" / "Line 1:" artifacts.
 *
 * @param chunk - Transcript slice.
 * @param idx - Chunk index for logging.
 * @param total - Total chunk count for logging.
 * @returns Summary text for this chunk.
 */
async function summarizeChunk(
  chunk: string,
  idx: number,
  total: number
): Promise<string> {
  const prompt = `You are a precise note taker for a Dungeons & Dragons session.

CHUNK ${idx + 1} OF ${total} — MODE: VERBATIM-ONLY RECAP
Rules:
- Use ONLY facts that appear in THIS CHUNK.
- Do NOT infer or invent quests, items, mechanics, or characters not present here.
- Keep proper nouns exactly as written in the chunk.
- If a detail is uncertain in THIS CHUNK, omit it (do not guess).

Output format:
- Write 2-4 sections for THIS CHUNK.
- Each section MUST follow this structure:
  • First line: a SHORT TITLE (do not include the word "Title").
  • Next 1-3 lines: factual sentences about that topic.
- Put ONE blank line between sections.
- Do not label lines, do not add numbers, bullets, or hashes.

CHUNK TEXT:
${chunk}`;

  return callLLM(prompt, `LLM_chunk_${idx + 1}/${total}`);
}

/**
 * Hierarchical merge to combine many chunk summaries without exceeding
 * the model context window. Performs repeated merging in small groups
 * until a single summary remains.
 *
 * @param summaries - Individual chunk summaries.
 * @returns Final merged summary.
 */
async function hierarchicalMerge(summaries: string[]): Promise<string> {
  let layer = summaries.slice();
  let round = 1;

  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += MERGE_BATCH) {
      const group = layer.slice(i, i + MERGE_BATCH);
      const merged = await mergeSummaries(group);
      next.push(merged.trim());
    }
    layer = next;
    round++;
  }
  return layer[0] ?? "";
}

/**
 * Merge prompt that de-duplicates facts and keeps chronological flow.
 * The output format mirrors the chunk summaries for consistency.
 *
 * @param summaries - Group of chunk summaries to merge.
 * @returns Merged summary text.
 */
async function mergeSummaries(summaries: string[]): Promise<string> {
  const prompt = `Combine the given Dungeons & Dragons chunk summaries into ONE faithful recap.

MODE: VERBATIM-ONLY MERGE
- Use ONLY facts that appear in the chunk summaries below.
- Do NOT introduce any new names, places, items, rules, or conclusions.
- De-duplicate and keep chronological flow.
- If two statements contradict, prefer whichever is clearer and keep it neutral (omit speculation).

OUTPUT:
- Write 4-10 sections total.
- Each section MUST follow this structure:
  • First line: a SHORT TITLE (do not include the word "Title").
  • Next 1-3 lines: factual sentences.
- Put ONE blank line between sections.
- Do not label lines, do not add numbers, bullets, or hashes.

CHUNK SUMMARIES:
${summaries.map((s, i) => `--- CHUNK ${i + 1} ---\n${s}`).join("\n")}

FINAL SUMMARY:
(Use the same section format described above.)`;
  return callLLM(prompt, "LLM_merge");
}

/**
 * High-level entry point for summarizing an entire session transcript.
 * Short texts use a single prompt; long texts are chunked then merged.
 * Includes fallbacks to ensure a useful result even when some steps fail.
 *
 * @param rawText - Full session transcript.
 * @returns Final summary string.
 */
export async function summarizeDnDSession(rawText: string): Promise<string> {
  const text = rawText?.trim() ?? "";
  if (!text) return "";

  const wordCount = text.split(/\s+/).length;

  // Single-pass summarization for short transcripts to reduce latency.
  if (wordCount <= LONG_THRESHOLD_WORDS) {
    const prompt = `You are a faithful note-taker for a Table-Top Role Playing (Dungeons & Dragons) session.

MODE: VERBATIM-ONLY RECAP
- Use ONLY facts explicitly present in the transcript.
- Never invent names, items, quests, places, mechanics, or outcomes.
- If something is unclear or missing, omit it.

OUTPUT:
- Write 4-8 sections.
- Each section MUST follow this structure:
  • First line: a SHORT TITLE (do not include the word "Title").
  • Next 1-3 lines: concise factual sentences describing what happened.
- Put ONE blank line between sections.
- Do NOT use lists or bullets. Do NOT add "###" or any heading markup.
- Keep proper nouns exactly as written.
- Focus on: plot beats, explicit NPC names/roles, locations actually visited, items gained/lost, important player decisions and their consequences, and stated next steps.

TRANSCRIPT:
${text}`;

    const out = await callLLM(prompt, "LLM_single");
    return out;
  }

  // Chunking path for longer transcripts to stay within model context.
  const chunks = splitIntoChunks(text);
  const miniSummaries: string[] = [];

  const CONCURRENCY = Number(process.env.LLM_CONCURRENCY ?? 3);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= chunks.length) break;
      try {
        const s = await summarizeChunk(chunks[i], i, chunks.length);
        if (s) miniSummaries.push(s);
      } catch {
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker())
  );

  // If all chunk calls failed, attempt a clipped single-pass fallback.
  if (miniSummaries.length === 0) {
    const clipped = text.split(/\s+/).slice(0, CHUNK_TEXT).join(" ");
    const fallbackPrompt = `You are a precise session scribe for a Dungeons & Dragons game.
Summarize as 6-10 short sections, each with a short title on the first line and 1–3 factual sentences below it. 
No bullets, no numbering, blank line between sections. Use only facts in the text.

SESSION (CLIPPED):
${clipped}`;
    const out = await callLLM(fallbackPrompt, "LLM_fallback_single");
    return out;
  }

  // Merge all partial summaries into a single recap.
  try {
    const merged = await hierarchicalMerge(miniSummaries);
    if (merged) return merged.trim();
  } catch {
    // swallow merge failure; fallback below
  }

  // Last resort: return concatenated mini summaries with a soft length cap.
  const joined = miniSummaries.join("\n\n");
  return joined.length > 4000 ? joined.slice(0, 4000) + "\n…" : joined;
}

/**
 * Attempts to parse JSON from a potentially noisy model output.
 * Greedy match finds the first top-level object or array to increase robustness.
 */
function safeJSON<T = any>(raw: string): T | null {
  try {
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const body = m ? m[0] : raw;
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/**
 * Character card schema for structured extraction.
 * Many fields are optional and should be omitted if not explicitly stated.
 */
export type CharacterCard = {
  name: string;
  role?: string;          // Example: "wizard", "innkeeper", "half-elf ranger"
  affiliation?: string;   // Example: faction, party, town
  traits?: string[];      // Short descriptors from the transcript
  goals?: string[];       // Stated aims or quests
  lastLocation?: string;  // Last explicit place mentioned
  status?: string;        // Example: injured, missing, hostile, allied
  notes?: string;         // Free text fallback
};

/**
 * Extracts character cards from a transcript chunk with strict fidelity.
 * Returns unique entries by normalized name to avoid duplicates.
 *
 * @param rawText - Transcript chunk.
 * @returns Array of deduplicated character cards.
 */
export async function extractCharactersFromSession(rawText: string): Promise<CharacterCard[]> {
  const text = (rawText ?? "").trim();
  if (!text) return [];

  const prompt = `You are extracting CHARACTER CARDS from a TTRPG (D&D) transcript CHUNK.

STRICT RULES:
- USE ONLY facts explicitly stated in this chunk.
- IGNORE table/OOC chatter (jokes, small talk, scheduling, rules debate, audio/mic, snacks, meta, “back to the game”).
- DO NOT invent or “fix” names/roles/places/relationships.
- If a field is unknown in this chunk, omit it.
- If this chunk is only OOC/table talk, return [].

Return STRICT JSON ONLY (no commentary), as:
[
  {
    "name": "Exact Name As Said",
    "role": "short role/class/descriptor if stated",
    "affiliation": "group/town/faction if stated",
    "traits": ["1-5 short traits actually said"],
    "goals": ["1-5 explicit goals or tasks"],
    "lastLocation": "last explicit location",
    "status": "hostile/allied/injured/captive/etc if stated",
    "notes": "one short line only if useful"
  }
]

TRANSCRIPT CHUNK:
${text}`;

  const out = await callLLM(prompt, "LLM_chars_chunk");
  const parsed = safeJSON<CharacterCard[]>(out) ?? [];

  // Remove duplicates using a case-insensitive name key.
  const seen = new Set<string>();
  const unique = parsed.filter(c => {
    const k = (c?.name || "").trim().toLowerCase();
    if (!k) return false;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Keep a practical upper bound to avoid flooding the UI.
  return unique.slice(0, 25);
}

export { OLLAMA_HOST, OLLAMA_MODEL, LLM_REQUEST_TIMEOUT_MS, MAX_RETRIES, STALL_TIMEOUT_MS };