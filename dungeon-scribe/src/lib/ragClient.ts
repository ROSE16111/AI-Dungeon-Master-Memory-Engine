export type RAGUsed = { id: string; text: string; metadata: any };

export async function ragAnswer({
    question,
    topK = 5,
    where = { type: "raw" }, 
    }: {
    question: string;
    topK?: number;
    where?: Record<string, any>;
    }): Promise<{ answer: string; used: RAGUsed[] }> {
    const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, top_k: topK, where }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "RAG error");
    return (await res.json()) as { answer: string; used: RAGUsed[] };
}

export async function ragIngestTranscript({
    idPrefix,
    text,
    metadata,
    }: {
    idPrefix: string;
    text: string;
    metadata?: Record<string, any>;
    }) {
    const res = await fetch("/api/chroma/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_prefix: idPrefix, text, metadata }), // <— always transcript shape
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Ingest failed");
    return (await res.json()) as { ok: true; count: number };
}
