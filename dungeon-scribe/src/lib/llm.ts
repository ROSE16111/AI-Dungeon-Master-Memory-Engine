// Thresholds and hyperparameters for splitting, summarizing, and merging.
// Values are tuned for short, factual recaps rather than creative writing.
const LONG_THRESHOLD_WORDS = 1000;  // Single-pass summarization below this word count
const CHUNK_TEXT = 700;             // Approximate words per chunk for long transcripts
const CHUNK_OVERLAP = 70;           // Overlap preserves context at chunk boundaries
const TEMP = 0.1;                   // Low temperature to reduce fabrication
const MERGE_BATCH = 6;              // Number of chunk summaries merged per round

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
 * @param prompt - Prompt text to send.
 * @param label - Console timer label to identify the request in logs.
 * @returns Raw model response text.
 * @throws Rethrows on non-OK HTTP or network failures.
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

/**
 * Summarizes a single transcript chunk with strict factual constraints.
 * Output is structured as short titled sections to support later merging.
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
        - Each section MUST be:
          Line 1: SHORT TITLE (do not use the word title)
          Line 2..3: 1-3 factual sentences
        - Blank line between sections. No bullets, no numbering, no "###".
        - Focus on the following (if stated): plot beats, explicit NPC names/roles, locations actually visited, items gained/lost, important player decisions and their consequences, hooks/next steps that were said.

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
        - If two bullets contradict, prefer whichever is clearer and keep it neutral (omit speculation).

        OUTPUT:
        - Write 4-10 sections total.
        - Each section MUST be:
          Line 1: SHORT TITLE (no hashes, bullets, or numbers, do not use the word title)
          Line 2..3: 1-3 factual sentences
        - One blank line between sections.
        - Focus on the following (if stated): plot beats, explicit NPC names/roles, locations actually visited, items gained/lost, important player decisions and their consequences, hooks/next steps that were said.

        CHUNK SUMMARIES:
        ${summaries.map((s, i) => `--- CHUNK ${i + 1} ---\n${s}`).join("\n")}

        FINAL SUMMARY (bullets only):
        `;
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
    const prompt = `You are a faithful note-taker for a Table-Top Role Plating (Dungeons & Dragons) session.

        MODE: VERBATIM-ONLY RECAP
        - Use ONLY facts explicitly present in the transcript.
        - Never invent names, items, quests, places, mechanics, or outcomes.
        - If something is unclear or missing, omit it.

        OUTPUT:
        - Write 4-8 sections.
        - Each section MUST be:
          Line 1: A SHORT TITLE on its own line (no hashes, no numbers, no bullets, do not use the word title).
          Line 2..3: 1-3 sentences of concise prose describing only facts from the text.
        - Put ONE blank line between sections.
        - Do NOT use lists or bullets. Do NOT add "###" or any other heading markup.
        - Keep proper nouns exactly as written.
        - Focus on the following (if stated): plot beats, explicit NPC names/roles, locations actually visited, items gained/lost, important player decisions and their consequences, hooks/next steps that were said.
        - No meta-comments, no headings, no numbering, no analysis, no advice, no rules talk.

        TRANSCRIPT:
        ${text}`;

    const out = await callLLM(prompt, "LLM_single");
    return out;
  }

  // Chunking path for longer transcripts to stay within model context.
  const chunks = splitIntoChunks(text);
  const miniSummaries: string[] = [];

  // Summarize each chunk independently. Errors are isolated per chunk.
  for (let i = 0; i < chunks.length; i++) {
    try {
      const s = await summarizeChunk(chunks[i], i, chunks.length);
      if (s) miniSummaries.push(s);
    } catch {}
  }

  // If all chunk calls failed, attempt a clipped single-pass fallback.
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

  // Merge all partial summaries into a single recap.
  try {
    const merged = await hierarchicalMerge(miniSummaries);
    if (merged) return merged.trim();
  } catch {}

  // Last resort: return concatenated mini summaries with a soft length cap.
  const joined = miniSummaries.join("\n");
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