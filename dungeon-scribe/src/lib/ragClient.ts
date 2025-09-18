// lib/ragClient.ts
export type IngestItem = {
    id: string;
    text: string;
    metadata?: Record<string, unknown>;
};

export type QueryResult = {
    id: string;
    text: string;
    metadata: Record<string, unknown>;
    distance: number | null;
};

/* ---------------- text utils ---------------- */

export function simpleChunk(
    text: string,
    opts: { maxChars?: number; overlap?: number } = {}
    ): string[] {
    const maxChars = opts.maxChars ?? 1200;
    const overlap = Math.max(0, opts.overlap ?? 100);

    // paragraph → sentence-ish split
    const raw = text.split(/\n\s*\n/).flatMap((blk) => blk.split(/(?<=[\.!\?])\s+/));
    const chunks: string[] = [];
    let buf = "";

    const push = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ""; };

    for (const piece of raw) {
        const candidate = buf ? `${buf} ${piece}` : piece;
        if (candidate.length <= maxChars) {
        buf = candidate;
        } else {
        if (!buf) {
            // hard-slice single long piece
            for (let i = 0; i < piece.length; i += maxChars - overlap) {
            chunks.push(piece.slice(i, Math.min(piece.length, i + maxChars)));
            }
        } else {
            push();
            const tail = chunks.at(-1)?.slice(-overlap) ?? "";
            const start = tail ? `${tail} ${piece}` : piece;
            if (start.length > maxChars) {
            for (let i = 0; i < start.length; i += maxChars - overlap) {
                chunks.push(start.slice(i, Math.min(start.length, i + maxChars)));
            }
            } else {
            buf = start;
            }
        }
        }
    }
    push();
    return chunks;
}

export function toIngestItems(
    chunks: string[],
    meta: Record<string, unknown>,
    baseId: string
    ): IngestItem[] {
    return chunks.map((text, i) => ({
        id: `${baseId}_${i.toString().padStart(4, "0")}`,
        text,
        metadata: meta,
    }));
}

/* --------------- API wrappers (Next routes) --------------- */

function getBaseUrl() {
    // Server-side: construct absolute base
    if (typeof window === "undefined") {
        // Prefer explicit env, else Vercel URL, else localhost
        const envBase =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
        return envBase || "http://localhost:3000";
    }
    // Browser: relative is fine
    return "";
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
    const base = getBaseUrl();
    const res = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${msg}`);
    }
    return res.json() as Promise<T>;
}

export async function ingest(items: IngestItem[]) {
    if (!items.length) return { ok: true, count: 0 };
    return postJSON<{ ok: boolean; count: number }>("/api/chroma/ingest", { items });
}

export async function querySimilar(params: {
    query: string;
    topK?: number;
    where?: Record<string, unknown>;
    }): Promise<QueryResult[]> {
    const { query, topK = 5, where } = params;
    const data = await postJSON<{ results: QueryResult[] }>("/api/chroma/query", {
        query,
        top_k: topK,
        where,
    });
    return data.results;
}

/* --------------- one-call helper for summaries --------------- */

export async function ingestSummary(summary: string, meta: Record<string, unknown>) {
    const chunks = simpleChunk(summary, { maxChars: 1200, overlap: 100 });
    const baseId = `summary_${Date.now()}`;
    const items = toIngestItems(chunks, meta, baseId);
    return ingest(items);
}

export async function ragAnswer(params: {
    question: string;
    topK?: number;
    where?: Record<string, unknown>;
    }): Promise<{ answer: string; used: Array<{ i: number; id: string; meta: Record<string, unknown> }>} > {
    const res = await fetch("/api/rag/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`RAG answer failed — ${msg}`);
    }
    const data = await res.json();
    return { answer: data.answer ?? "", used: data.used ?? [] };
}

