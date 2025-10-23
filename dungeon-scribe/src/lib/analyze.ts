import { prisma } from "@/lib/prisma";
import { SummaryType } from "@prisma/client";
import { summarizeDnDSession, extractCharactersFromSession } from "@/lib/llm";

/**
 * Arguments accepted by the analysis pipeline.
 */
export type AnalyzeArgs = {
    /** Optional title used to resolve/create a Campaign when campaignId is not provided. */
    title?: string;
    /** Raw transcript text to analyze (required). */
    text: string;
    /** Origin of the text for telemetry/UI; persisted in the response. */
    source?: "live" | "upload";
    /** If provided, attempts to update this existing session Summary row. */
    summaryId?: string;
    /** Target campaign; if omitted, campaign is resolved/created by title. */
    campaignId?: string;

    /** If true and `summary` is non-empty, bypasses LLM summarization. */
    useProvidedSummary?: boolean;
    /** A precomputed summary to store (used when `useProvidedSummary` is true). */
    summary?: string;

    /** If true, skip LLM character extraction entirely. */
    skipCharacterExtraction?: boolean;
    /**
     * Optional pre-provided character cards to store instead of extracting via LLM.
     * When present and non-empty, character extraction is skipped.
     */
    characterCards?: Array<{
        name: string;
        role?: string;
        affiliation?: string;
        traits?: string[];
        goals?: string[];
        lastLocation?: string;
        status?: string;
        notes?: string;
    }>;
};

/**
 * Build a readable multi-block text payload for a character card.
 * Each block is titled (e.g., "Traits") followed by its content on the next line.
 * If no fields are populated, the character's name is returned as a fallback.
 *
 * @param c - Character card fields
 * @returns Multi-paragraph string suitable for storing in `Summary.content`
 */
function blocksFromCard(c: {
    name: string;
    role?: string;
    affiliation?: string;
    traits?: string[];
    goals?: string[];
    lastLocation?: string;
    status?: string;
    notes?: string;
    }): string {
    const blocks: string[] = [];

    // Helper to append a titled block if a value exists.
    const push = (title: string, value?: string | string[]) => {
        if (!value) return;
        const v = Array.isArray(value) ? value.join(", ") : String(value).trim();
        if (v) blocks.push(`${title}\n${v}`);
    };

    // Order is intentional for readability in the UI.
    push("Role", c.role);
    push("Affiliation", c.affiliation);
    push("Traits", c.traits ?? []);
    // Goals can be authored as an array; we preserve comma-joins above and add a light
    // formatting tweak here for semicolon-separated phrasing, if provided as string[].
    push("Goals", (c.goals ?? []).join("; "));
    push("Last location", c.lastLocation);
    push("Status", c.status);
    push("Notes", c.notes);

    // If nothing but the name is known, store the name to avoid empty content.
    return blocks.length ? blocks.join("\n\n") : c.name;
}

/**
 * Analyze, summarize, and persist session text and character information.
 *
 *
 * @param body - {@link AnalyzeArgs} request payload
 * @returns Persisted IDs and computed outputs for downstream UI
 */
export async function analyzeText(body: AnalyzeArgs) {
    // 1) Validate input text
    const text = (body.text ?? "").trim();
    if (!text) throw new Error("Empty text");

    // 2) Resolve or create Campaign
    let campaign =
        body.campaignId
        ? await prisma.campaign.findUnique({ where: { id: body.campaignId } })
        : null;

    const campaignTitle = (body.title || "Untitled Campaign").trim();
    if (!campaign) {
        // Try by title first to avoid duplicate campaigns
        campaign = await prisma.campaign.findFirst({ where: { title: campaignTitle } });
        if (!campaign) {
        campaign = await prisma.campaign.create({ data: { title: campaignTitle } });
        }
    }

    // 3) Persist raw text to AllTxt and bump campaign timestamp
    const allTxt = await prisma.allTxt.create({
        data: { content: text, campaignId: campaign.id },
    });

    await prisma.campaign.update({
        where: { id: campaign.id },
        data: { updateDate: new Date() },
    });

    // Utility type: element type from extractCharactersFromSession() return
    type ExtractedChar =
        Awaited<ReturnType<typeof extractCharactersFromSession>> extends Array<infer U>
        ? U
        : never;

    // 4) Session summary: prefer provided when explicitly requested & non-empty
    const wantProvidedSummary = !!(body.useProvidedSummary && (body.summary || "").trim());
    const summaryPromise = wantProvidedSummary
        ? Promise.resolve((body.summary || "").trim())
        : summarizeDnDSession(text);

    // 5) Character cards: prefer provided array; otherwise LLM (unless skipped)
    let charactersPromise: Promise<ExtractedChar[]> = Promise.resolve([]);
    if (Array.isArray(body.characterCards) && body.characterCards.length) {
        // Map user-provided structure into the ExtractedChar shape (best-effort cast)
        const mapped = body.characterCards.map((c) => ({
        name: c.name,
        role: c.role,
        affiliation: c.affiliation,
        traits: c.traits || [],
        goals: c.goals || [],
        lastLocation: c.lastLocation,
        status: c.status,
        notes: c.notes,
        })) as unknown as ExtractedChar[];
        charactersPromise = Promise.resolve(mapped);
    } else if (!body.skipCharacterExtraction) {
        // Swallow LLM extraction errors and continue with an empty set
        charactersPromise = extractCharactersFromSession(text).catch(() => []);
    }

    // Run summary + characters concurrently for latency
    const [contentRaw, characters] = await Promise.all([summaryPromise, charactersPromise]);

    // Defensive fallback if LLM returns an empty/whitespace summary
    const content =
        (contentRaw && contentRaw.trim()) ||
        "• Summary unavailable. (LLM produced no output)\n• Check Ollama host/model configuration.";

    // 6) Upsert session-level Summary: update if summaryId was provided, else create
    let summaryRow;
    if (body.summaryId) {
        try {
        summaryRow = await prisma.summary.update({
            where: { id: body.summaryId },
            data: { content, campaignId: campaign.id, type: SummaryType.session },
        });
        } catch {
        // If the specified summaryId doesn't exist or isn't updatable, create a new row
        summaryRow = await prisma.summary.create({
            data: { type: SummaryType.session, content, campaignId: campaign.id },
        });
        }
    } else {
        summaryRow = await prisma.summary.create({
        data: { type: SummaryType.session, content, campaignId: campaign.id },
        });
    }

    // 7) Persist one character Summary per extracted/provided card.
    //    Create roles for new characters automatically.
    //    Errors per-card are swallowed to avoid failing the entire batch.
    const createdCharacterSummaries: Array<{ id: string; name: string }> = [];
    for (const card of characters) {
        try {
        const characterName = (card as any).name?.trim();
        if (!characterName) continue; // Skip if no name

        const block = blocksFromCard({
            name: characterName,
            role: (card as any).role,
            affiliation: (card as any).affiliation,
            traits: (card as any).traits ?? [],
            goals: (card as any).goals ?? [],
            lastLocation: (card as any).lastLocation,
            status: (card as any).status,
            notes: (card as any).notes,
        });

        // Check if a role with this character name already exists in this campaign
        const existingRole = await prisma.role.findFirst({
            where: {
            name: characterName,
            campaignId: campaign.id,
            },
        });

        // If role doesn't exist, create it with default level 1
        if (!existingRole) {
            try {
            await prisma.role.create({
                data: {
                name: characterName,
                level: 1, // Default level for new characters
                campaignId: campaign.id,
                },
            });
            console.log(`[Analyze] Created new role: ${characterName} for campaign ${campaign.id}`);
            } catch (roleError) {
            console.warn(`[Analyze] Failed to create role for ${characterName}:`, roleError);
            // Continue even if role creation fails
            }
        }

        // Create the character summary
        const row = await prisma.summary.create({
            data: {
            type: SummaryType.character,
            roleName: characterName,
            content: block,
            campaignId: campaign.id,
            },
        });
        createdCharacterSummaries.push({ id: row.id, name: characterName });
        } catch (error) {
        // Tolerate per-row failures - continue creating remaining character summaries
        console.warn('[Analyze] Failed to process character card:', error);
        }
    }

    // 8) Refresh Campaign.updateDate to reflect all persisted artifacts
    await prisma.campaign.update({
        where: { id: campaign.id },
        data: { updateDate: new Date() },
    });

    // Response is designed for immediate UI binding
    return {
        campaignId: campaign.id,
        allTxtId: allTxt.id,
        summaryId: summaryRow.id,
        title: campaignTitle,
        source: body.source || "live",
        summary: content,
        characters,
        characterSummaryIds: createdCharacterSummaries,
    };
}
