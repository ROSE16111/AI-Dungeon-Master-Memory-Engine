import { Ollama } from "ollama";

const client = new Ollama({ host: process.env.OLLAMA_HOST });
const model = process.env.OLLAMA_MODEL ?? "phi3:medium";

const LONG_THRESHOLD_WORDS = 1000;
const CHUNK_TEXT = 700;
const CHUNK_OVERLAP = 70;
const TEMP = 0.1;
const MERGE_BATCH = 6;

/**
 * Splits a long transcript into overlapping chunks of text.
 *
 * @param text - Full transcript text to split.
 * @param size - Number of words per chunk (default: `CHUNK_WORDS`).
 * @param overlap - Number of overlapping words between chunks (default: `CHUNK_OVERLAP`).
 * @returns Array of chunk strings, each containing up to `size` words.
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
 * Calls the Ollama LLM with the given prompt and logs the duration.
 *
 * @param prompt - The prompt text to send to the model.
 * @param label - A label used for console timing and error logging.
 * @returns LLM response.
 * @throws Rethrows errors from Ollama client after logging.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi3:medium";

/**
 * Calls the Ollama REST API with a given prompt.
 */
async function callLLM(prompt: string, label: string): Promise<string> {
  console.time(label);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: TEMP },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const out = (data.response ?? "").trim();
    console.timeEnd(label);
    return out;
  } catch (err: any) {
    console.timeEnd(label);
    console.error(`${label}_ERROR`, {
      msg: err?.message,
      code: err?.code,
      name: err?.name,
    });
    throw err;
  }
}

// async function callLLM(prompt: string, label: string): Promise<string> {
//     console.time(label);
//     try {
//         const res = await client.generate({ model, prompt, options: { temperature: TEMP } });
//         const out = (res.response ?? "").trim();
//         console.timeEnd(label);
//         return out;
//     } catch (err: any) {
//         console.timeEnd(label);
//         console.error(`${label}_ERROR`, { msg: err?.message, code: err?.code, name: err?.name });
//         throw err;
//     }
// }

/**
 * Summarizes a single transcript chunk into factual bullet point summary.
 *
 * @param chunk - The transcript slice text.
 * @param idx - Index of this chunk (zero-based).
 * @param total - Total number of chunks.
 * @returns LLM-produced summary of the chunk.
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
        - 3-8 bullets, each starting with "• ".
        - Short, factual bullets only.
        - Focus on the following (if stated): plot beats, explicit NPC names/roles, locations actually visited, items gained/lost, important player decisions and their consequences, hooks/next steps that were said.

        CHUNK TEXT:
        ${chunk}`;

  return callLLM(prompt, `LLM_chunk_${idx + 1}/${total}`);
}

/**
 * Merges summaries in hierarchical batches to avoid issues with context window
 * and timeout.
 *
 * @param summaries - Array of partial summaries from individual chunks.
 * @returns A single merged summary string.
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
 * Combines a group of chunk summaries into overall summary.
 *
 * @param summaries - Array of bullet point summaries to merge.
 * @returns LLM-produced merged bullet point summary.
 */
async function mergeSummaries(summaries: string[]): Promise<string> {
  const prompt = `Combine the given Dungeons & Dragons chunk summaries into ONE faithful recap.

        MODE: VERBATIM-ONLY MERGE
        - Use ONLY facts that appear in the chunk summaries below.
        - Do NOT introduce any new names, places, items, rules, or conclusions.
        - De-duplicate and keep chronological flow.
        - If two bullets contradict, prefer whichever is clearer and keep it neutral (omit speculation).

        OUTPUT:
        - ≤10 bullets total, each starting with "• ".
        - No headings, no numbering, no meta-notes—bullets only.
        - Focus on the following (if stated): plot beats, explicit NPC names/roles, locations actually visited, items gained/lost, important player decisions and their consequences, hooks/next steps that were said.

        CHUNK SUMMARIES:
        ${summaries.map((s, i) => `--- CHUNK ${i + 1} ---\n${s}`).join("\n")}

        FINAL SUMMARY (bullets only):
        `;
  return callLLM(prompt, "LLM_merge");
}

/**
 * Summarizes an entire TTRPG session transcript.
 *
 * - If short, summarises in a single pass.
 * - If long, splits into chunks, summarizes each, then merges.
 * - Includes fallbacks if chunk or merge steps fail.
 *
 * @param rawText - Full session transcript text.
 * @returns Final summary as a bullet point string, trimmed if very long.
 */
export async function summarizeDnDSession(rawText: string): Promise<string> {
  const text = rawText?.trim() ?? "";
  if (!text) return "";

  const wordCount = text.split(/\s+/).length;

  if (wordCount <= LONG_THRESHOLD_WORDS) {
    const prompt = `You are a faithful note-taker for a Dungeons & Dragons session.

        MODE: VERBATIM-ONLY RECAP
        - Use ONLY facts explicitly present in the transcript.
        - Never invent names, items, quests, places, mechanics, or outcomes.
        - If something is unclear or missing, omit it.

        OUTPUT:
        - 5-10 bullets, each starting with "• ".
        - Keep bullets short and factual.
        - Focus on the following (if stated): plot beats, explicit NPC names/roles, locations actually visited, items gained/lost, important player decisions and their consequences, hooks/next steps that were said.
        - No meta-comments, no headings, no numbering, no analysis, no advice, no rules talk.

        TRANSCRIPT:
        ${text}`;

    const out = await callLLM(prompt, "LLM_single");
    return out;
  }

  const chunks = splitIntoChunks(text);
  const miniSummaries: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      const s = await summarizeChunk(chunks[i], i, chunks.length);
      if (s) miniSummaries.push(s);
    } catch {}
  }

  if (miniSummaries.length === 0) {
    const clipped = text.split(/\s+/).slice(0, CHUNK_TEXT).join(" ");
    const fallbackPrompt = `You are a precise session scribe for a Dungeons & Dragons game.
        Summarize as ≤10 bullets focusing on main story beats only (plot, NPCs, locations, items, decisions/consequences, next steps). 
        No fluff.

        SESSION (CLIPPED):
        ${clipped}`;
    const out = await callLLM(fallbackPrompt, "LLM_fallback_single");
    return out;
  }

  try {
    const merged = await hierarchicalMerge(miniSummaries);
    if (merged) return merged.trim();
  } catch {}

  const joined = miniSummaries.join("\n");
  return joined.length > 4000 ? joined.slice(0, 4000) + "\n…" : joined;
}

/** Attempts to parse possibly messy JSON by trimming code fences etc. */
function safeJSON<T = any>(raw: string): T | null {
  try {
    // strip triple-backticks or leading text
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const body = m ? m[0] : raw;
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/** Extract characters mentioned in the transcript as structured records. */
export type CharacterCard = {
  name: string;
  role?: string;          // e.g., "wizard", "innkeeper", "half-elf ranger"
  affiliation?: string;   // faction, party, town etc.
  traits?: string[];      // short descriptors
  goals?: string[];       // stated aims/quests
  lastLocation?: string;  // last explicit place mentioned
  status?: string;        // e.g., injured, missing, hostile, allied
  notes?: string;         // free text fallback
};

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
  // de-dupe by name
  const seen = new Set<string>();
  const unique = parsed.filter(c => {
    const k = (c?.name || "").trim().toLowerCase();
    if (!k) return false;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.slice(0, 25);
}



