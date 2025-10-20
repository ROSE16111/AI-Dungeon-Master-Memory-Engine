/**
 * Structure for a retrieved document snippet used by the RAG (Retrieval-Augmented Generation) system.
 * Each entry represents one piece of context returned from the vector database.
 */
export type RAGUsed = {
  id: string;      // Unique document or chunk ID
  text: string;    // Retrieved text content
  metadata: any;   // Arbitrary metadata (e.g., type, campaign, source)
};

/**
 * Sends a question to the backend RAG answer endpoint.
 * The backend retrieves relevant context from the Chroma vector store
 * and uses the language model to generate a concise factual answer.
 *
 * @param question - The user’s question or prompt to answer.
 * @param topK - Number of top-matching documents to include as context (default: 5).
 * @param where - Optional metadata filter (default: { type: "raw" }).
 * @returns The final answer string and the set of retrieved context snippets.
 * @throws Error if the backend returns a non-OK HTTP status.
 */
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

    if (!res.ok)
        throw new Error(
        (await res.json().catch(() => ({})))?.detail || "RAG error"
        );

    return (await res.json()) as { answer: string; used: RAGUsed[] };
}

/**
 * Ingests a transcript into the vector store for later retrieval.
 * The transcript is split into chunks and embedded server-side.
 * Typically used when processing new session recordings or summaries.
 *
 * @param idPrefix - Identifier prefix for the generated chunk IDs.
 * @param text - Full transcript text to store.
 * @param metadata - Optional metadata describing the source (e.g., campaignId, role).
 * @returns Confirmation object with `ok: true` and number of chunks added.
 * @throws Error if ingestion fails or the backend responds with an error.
 */
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
        // Request body follows transcript ingestion schema expected by the API.
        body: JSON.stringify({ id_prefix: idPrefix, text, metadata }),
    });

    if (!res.ok)
        throw new Error(
        (await res.json().catch(() => ({})))?.detail || "Ingest failed"
        );

    return (await res.json()) as { ok: true; count: number };
}
