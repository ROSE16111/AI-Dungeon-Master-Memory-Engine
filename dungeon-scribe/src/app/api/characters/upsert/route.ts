import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { SummaryType } from "@prisma/client";
import { extractCharactersFromSession, type CharacterCard } from "@/lib/llm";

export const runtime = "nodejs";

// Expected request body shape
type Body = { campaignId: string; text: string };

/**
 * Returns a deduplicated version of an array.
 * Works for both strings and objects by normalizing string entries.
 */
function uniq<T>(arr: T[] | undefined): T[] {
    return Array.from(
        new Set((arr ?? []).map((x) => (typeof x === "string" ? (x as string).trim() : x)))
    ).filter((x) => (typeof x === "string" ? (x as string).length > 0 : true)) as T[];
}

/**
 * Merges two character cards into one by keeping existing fields
 * and preferring new values from the incoming card when available.
 * Lists like traits and goals are merged and deduplicated.
 */
function mergeCard(existing: CharacterCard, incoming: CharacterCard): CharacterCard {
    return {
        name: incoming.name || existing.name,
        role: incoming.role || existing.role,
        affiliation: incoming.affiliation || existing.affiliation,
        lastLocation: incoming.lastLocation || existing.lastLocation,
        status: incoming.status || existing.status,
        traits: uniq([...(existing.traits ?? []), ...(incoming.traits ?? [])]),
        goals: uniq([...(existing.goals ?? []), ...(incoming.goals ?? [])]),
        notes: incoming.notes || existing.notes,
    };
}

/**
 * Converts a CharacterCard object into a human-readable text format
 * used for storing in the `summary` table (field: content).
 * Each field becomes a titled block separated by blank lines.
 */
function cardToContent(c: CharacterCard): string {
    const blocks: string[] = [];

    const pushBlock = (title: string, value: string | string[] | undefined) => {
        if (!value) return;
        const v = Array.isArray(value) ? value.join(", ") : String(value).trim();
        if (!v) return;
        blocks.push(`${title}\n${v}`);
    };

    pushBlock("Role", c.role);
    pushBlock("Affiliation", c.affiliation);
    pushBlock("Traits", c.traits);
    pushBlock("Goals", c.goals?.join("; "));
    pushBlock("Last location", c.lastLocation);
    pushBlock("Status", c.status);
    pushBlock("Notes", c.notes);

    // Fallback to at least the name if no data exists
    if (blocks.length === 0) return c.name || "";

    return blocks.join("\n\n");
}

/**
 * Parses the stored content text back into a CharacterCard object.
 * Recognizes both block-style (field: value) and simple bullet styles.
 * Provides fallback parsing for legacy or loosely formatted content.
 */
function parseContentToCard(name: string, content: string | null | undefined): CharacterCard {
    const text = (content ?? "").trim();

    const blockRe =
        /(Role|Affiliation|Traits|Goals|Last location|Status|Notes)\s*\n([\s\S]*?)(?:\n\s*\n|$)/gi;

    const blocks: Record<string, string> = {};
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(text)) !== null) {
        const key = m[1].toLowerCase();
        const val = (m[2] || "").trim();
        if (val) blocks[key] = val;
    }

    const fromBlocks: CharacterCard = {
        name,
        role: blocks["role"],
        affiliation: blocks["affiliation"],
        traits:
        (blocks["traits"] || "")
            .split(/\s*,\s*/)
            .map((s) => s.trim())
            .filter(Boolean) || [],
        goals:
        (blocks["goals"] || "")
            .split(/\s*;\s*|\n+/)
            .map((s) => s.trim())
            .filter(Boolean) || [],
        lastLocation: blocks["last location"],
        status: blocks["status"],
        notes: blocks["notes"],
    };

    // If we found any actual data, return it directly
    const anyNew =
        !!fromBlocks.role ||
        !!fromBlocks.affiliation ||
        ((fromBlocks.traits?.length ?? 0) > 0) ||
        ((fromBlocks.goals?.length ?? 0) > 0) ||
        !!fromBlocks.lastLocation ||
        !!fromBlocks.status ||
        !!fromBlocks.notes;

    if (anyNew) return fromBlocks;

    // Fallback: try to match single-line "Field: value" style
    const get = (re: RegExp) => text.match(re)?.[1]?.trim();
    const list = (re: RegExp, sep: RegExp) =>
        get(re)?.split(sep).map((s) => s.trim()).filter(Boolean) ?? [];

    return {
        name,
        role: get(/Role:\s*(.+)/i),
        affiliation: get(/Affiliation:\s*(.+)/i),
        traits: list(/Traits:\s*(.+)/i, /\s*,\s*/),
        goals: list(/Goals:\s*(.+)/i, /\s*;\s*/),
        lastLocation: get(/Last location:\s*(.+)/i),
        status: get(/Status:\s*(.+)/i),
        notes: get(/Notes:\s*(.+)/i),
    };
}

/**
 * Combines multiple CharacterCard objects with the same name.
 * Ensures unique names (case-insensitive) and merges repeated entries.
 */
function coalesceByName(cards: CharacterCard[]): CharacterCard[] {
    const byKey = new Map<string, CharacterCard>();
    for (const c of cards) {
        const name = (c.name || "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const prev = byKey.get(key);
        byKey.set(
        key,
        prev
            ? mergeCard({ ...prev, name: prev.name || name }, { ...c, name: prev.name || name })
            : { ...c, name }
        );
    }
    return Array.from(byKey.values());
}

// ---------------- route ----------------

/**
 * POST /api/characters/upsert
 *
 * Extracts character information from a campaign transcript and
 * upserts Character Summaries in the Prisma database.
 *
 * - Uses the LLM-based extractor to generate character cards.
 * - Merges new information with existing summaries.
 * - Creates or updates entries in the `summary` table (type: "character").
 * - Touches the parent campaign’s update timestamp.
 */
export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Body;
        const campaignId = body.campaignId?.trim();
        const text = (body.text ?? "").trim();
        if (!campaignId || !text) {
        return NextResponse.json({ error: "campaignId and text required" }, { status: 400 });
        }

        // Extract structured character data via LLM
        const extracted = await extractCharactersFromSession(text);
        if (!extracted?.length) return NextResponse.json({ upserts: [] });

        // Merge duplicates by name
        const found = coalesceByName(extracted);
        const names = found.map((c) => c.name).filter(Boolean);
        if (!names.length) return NextResponse.json({ upserts: [] });

        // Fetch existing summaries for this campaign to merge against
        const existing = await prisma.summary.findMany({
        where: { campaignId, type: SummaryType.character, roleName: { in: names } },
        select: { id: true, roleName: true, content: true },
        });

        const byName = new Map<string, (typeof existing)[number]>();
        for (const row of existing) {
        if (!row.roleName) continue;
        byName.set(row.roleName, row);
        }

        // Prepare Prisma operations for transactional upsert
        const ops: Prisma.PrismaPromise<{ id: string; roleName: string | null }>[] = [];

        for (const inc of found) {
        const name = inc.name.trim();
        if (!name) continue;

        // Check if a role exists for this character in this campaign
        const existingRole = await prisma.role.findFirst({
            where: {
            name: name,
            campaignId: campaignId,
            },
        });

        // If role doesn't exist, create it with default level 1
        if (!existingRole) {
            try {
            await prisma.role.create({
                data: {
                name: name,
                level: 1, // Default level for new characters
                campaignId: campaignId,
                },
            });
            console.log(`[Characters/Upsert] Created new role: ${name} for campaign ${campaignId}`);
            } catch (roleError) {
            console.warn(`[Characters/Upsert] Failed to create role for ${name}:`, roleError);
            // Continue even if role creation fails
            }
        }

        const had = byName.get(name);
        const merged = had ? mergeCard(parseContentToCard(name, had.content), inc) : inc;
        const content = cardToContent(merged);

        if (had) {
            // Update existing summary
            ops.push(
            prisma.summary.update({
                where: { id: had.id },
                data: { content },
                select: { id: true, roleName: true },
            })
            );
        } else {
            // Create new summary
            ops.push(
            prisma.summary.create({
                data: { type: SummaryType.character, campaignId, roleName: name, content },
                select: { id: true, roleName: true },
            })
            );
        }
        }

        if (!ops.length) return NextResponse.json({ upserts: [] });

        // Execute all upserts in a transaction
        const rows = await prisma.$transaction(ops);

        // Return lightweight list of updated character IDs and names
        const upserts = rows.map((r) => ({
        id: r.id,
        name: (r.roleName ?? "") || "",
        }));

        return NextResponse.json({ upserts });
    } catch (err: any) {
        console.error("POST /api/characters/upsert error:", err?.message || err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
