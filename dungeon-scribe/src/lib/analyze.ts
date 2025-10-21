// src/server/analyze.ts
// NEW: Shared analyze logic so routes can call directly (no internal HTTP fetch).

import { prisma } from "@/lib/prisma"; // unchanged import
import { SummaryType } from "@prisma/client"; // unchanged import
import { summarizeDnDSession, extractCharactersFromSession } from "@/lib/llm"; // unchanged import

// NEW: exported type for callers (upload/analyze routes)
export type AnalyzeArgs = {
    title?: string;
    text: string;
    source?: "live" | "upload";
    summaryId?: string;
    campaignId?: string;

    useProvidedSummary?: boolean;
    summary?: string;
    skipCharacterExtraction?: boolean;
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

// moved from analyze route (unchanged)
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
    const push = (title: string, value?: string | string[]) => {
        if (!value) return;
        const v = Array.isArray(value) ? value.join(", ") : String(value).trim();
        if (v) blocks.push(`${title}\n${v}`);
    };

    push("Role", c.role);
    push("Affiliation", c.affiliation);
    push("Traits", c.traits ?? []);
    push("Goals", (c.goals ?? []).join("; "));
    push("Last location", c.lastLocation);
    push("Status", c.status);
    push("Notes", c.notes);

    return blocks.length ? blocks.join("\n\n") : c.name;
}

// NEW: main function formerly inside /api/analyze POST
export async function analyzeText(body: AnalyzeArgs) {
    const text = (body.text ?? "").trim();
    if (!text) throw new Error("Empty text"); // CHANGED: throw instead of NextResponse here

    // --- Resolve campaign by explicit id OR by title (create if not exists) ---
    let campaign =
        body.campaignId
        ? await prisma.campaign.findUnique({ where: { id: body.campaignId } })
        : null;

    const campaignTitle = (body.title || "Untitled Campaign").trim();
    if (!campaign) {
        campaign = await prisma.campaign.findFirst({ where: { title: campaignTitle } });
        if (!campaign) {
        campaign = await prisma.campaign.create({ data: { title: campaignTitle } });
        }
    }

    // --- Store raw transcript ---
    const allTxt = await prisma.allTxt.create({
        data: { content: text, campaignId: campaign.id },
    });

    // --- Touch updateDate for the campaign ---
    await prisma.campaign.update({
        where: { id: campaign.id },
        data: { updateDate: new Date() },
    });

    // CHANGED: Run summary + characters in parallel (formerly sequential)
    type ExtractedChar = Awaited<ReturnType<typeof extractCharactersFromSession>> extends Array<infer U> ? U : never;

    const wantProvidedSummary = !!(body.useProvidedSummary && (body.summary || "").trim());
    const summaryPromise = wantProvidedSummary
        ? Promise.resolve((body.summary || "").trim())
        : summarizeDnDSession(text); // heavy LLM work

    let charactersPromise: Promise<ExtractedChar[]> = Promise.resolve([]);
    if (Array.isArray(body.characterCards) && body.characterCards.length) {
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
        charactersPromise = extractCharactersFromSession(text).catch(() => []);
    }

    // CHANGED: await both together
    const [contentRaw, characters] = await Promise.all([summaryPromise, charactersPromise]);

    const content =
        (contentRaw && contentRaw.trim()) ||
        "• Summary unavailable. (LLM produced no output)\n• Check Ollama host/model configuration.";

    // --- Save or update the session summary row (unchanged logic) ---
    let summaryRow;
    if (body.summaryId) {
        try {
        summaryRow = await prisma.summary.update({
            where: { id: body.summaryId },
            data: { content, campaignId: campaign.id, type: SummaryType.session },
        });
        } catch {
        summaryRow = await prisma.summary.create({
            data: { type: SummaryType.session, content, campaignId: campaign.id },
        });
        }
    } else {
        summaryRow = await prisma.summary.create({
        data: { type: SummaryType.session, content, campaignId: campaign.id },
        });
    }

    // --- Create character summary rows (unchanged logic) ---
    const createdCharacterSummaries: Array<{ id: string; name: string }> = [];
    for (const card of characters) {
        try {
        const block = blocksFromCard({
            name: (card as any).name,
            role: (card as any).role,
            affiliation: (card as any).affiliation,
            traits: (card as any).traits ?? [],
            goals: (card as any).goals ?? [],
            lastLocation: (card as any).lastLocation,
            status: (card as any).status,
            notes: (card as any).notes,
        });

        const row = await prisma.summary.create({
            data: {
            type: SummaryType.character,
            roleName: (card as any).name,
            content: block,
            campaignId: campaign.id,
            },
        });
        createdCharacterSummaries.push({ id: row.id, name: (card as any).name });
        } catch {
        // tolerate per-row failures
        }
    }

    // --- Touch updateDate again ---
    await prisma.campaign.update({
        where: { id: campaign.id },
        data: { updateDate: new Date() },
    });

    // NEW: return plain object for routes to wrap in NextResponse
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
