// app/api/analyze/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SummaryType } from "@prisma/client";
import { summarizeDnDSession, extractCharactersFromSession } from "@/lib/llm";

export const runtime = "nodejs";

type AnalyzeBody = {
  title?: string;
  text: string;
  source?: "live" | "upload";
  summaryId?: string;
  campaignId?: string;

  useProvidedSummary?: boolean; // if true and summary provided, skip LLM summarization
  summary?: string;             // final summary text from client (what’s on screen)
  skipCharacterExtraction?: boolean; // if true, do NOT call extractCharactersFromSession
  characterCards?: Array<{
    name: string;
    role?: string;
    affiliation?: string;
    traits?: string[];
    goals?: string[];
    lastLocation?: string;
    status?: string;
    notes?: string;
  }>; // optional client-provided character list
};

/**
 * POST /api/analyze
 *
 * Ingests transcript text, ensures/creates a Campaign, saves raw text (AllTxt),
 * generates or reuses a session summary, optionally creates character summaries,
 * and returns references to stored objects.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeBody;

    const text = (body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Empty text" }, { status: 400 });
    }

    // --- Resolve campaign by explicit id OR by title (create if not exists) ---
    let campaign =
      body.campaignId
        ? await prisma.campaign.findUnique({ where: { id: body.campaignId } })
        : null;

    const campaignTitle = (body.title || "Untitled Campaign").trim();
    if (!campaign) {
      campaign = await prisma.campaign.findFirst({
        where: { title: campaignTitle },
      });
      if (!campaign) {
        campaign = await prisma.campaign.create({
          data: { title: campaignTitle },
        });
      }
    }

    // --- Store raw transcript ---
    const allTxt = await prisma.allTxt.create({
      data: {
        content: text,
        campaignId: campaign.id,
      },
    });

    // --- Touch updateDate for the campaign ---
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { updateDate: new Date() },
    });

    // --- Decide summary content (reuse vs LLM) ---
    let content = "";
    let summaryBullets = "";

    if (body.useProvidedSummary && (body.summary || "").trim()) {
      // Reuse the client-provided summary (no LLM)
      content = (body.summary || "").trim();
    } else {
      // Generate fresh summary with LLM
      summaryBullets = (await summarizeDnDSession(text)).trim();
      content =
        summaryBullets ||
        "• Summary unavailable. (LLM produced no output)\n• Check Ollama host/model configuration.";
    }

    // --- Characters: accept provided, or extract (unless explicitly skipped) ---
    type ExtractedChar = Awaited<
      ReturnType<typeof extractCharactersFromSession>
    > extends Array<infer U>
      ? U
      : never;

    let characters: ExtractedChar[] = [];

    if (Array.isArray(body.characterCards) && body.characterCards.length) {
      characters = body.characterCards.map((c) => ({
        name: c.name,
        role: c.role,
        affiliation: c.affiliation,
        traits: c.traits || [],
        goals: c.goals || [],
        lastLocation: c.lastLocation,
        status: c.status,
        notes: c.notes,
      })) as unknown as ExtractedChar[];
    } else if (!body.skipCharacterExtraction) {
      try {
        characters = await extractCharactersFromSession(text);
      } catch {
        characters = [];
      }
    } // else: leave empty

    // --- Save or update the session summary row ---
    let summaryRow;
    if (body.summaryId) {
      // Try to update an existing summary
      try {
        summaryRow = await prisma.summary.update({
          where: { id: body.summaryId },
          data: {
            content,
            campaignId: campaign.id,
            type: SummaryType.session,
          },
        });
      } catch {
        // If not found (or failed), create a fresh one
        summaryRow = await prisma.summary.create({
          data: {
            type: SummaryType.session,
            content,
            campaignId: campaign.id,
          },
        });
      }
    } else {
      summaryRow = await prisma.summary.create({
        data: {
          type: SummaryType.session,
          content,
          campaignId: campaign.id,
        },
      });
    }

    // --- Create character summary rows (if any) ---
    const createdCharacterSummaries: Array<{ id: string; name: string }> = [];
    for (const card of characters) {
      try {
        const lines: string[] = [];
        if ((card as any).role) lines.push(`• Role: ${(card as any).role}`);
        if ((card as any).affiliation)
          lines.push(`• Affiliation: ${(card as any).affiliation}`);
        if ((card as any).traits?.length)
          lines.push(`• Traits: ${(card as any).traits.join(", ")}`);
        if ((card as any).goals?.length)
          lines.push(`• Goals: ${(card as any).goals.join("; ")}`);
        if ((card as any).lastLocation)
          lines.push(`• Last location: ${(card as any).lastLocation}`);
        if ((card as any).status)
          lines.push(`• Status: ${(card as any).status}`);
        if ((card as any).notes) lines.push(`• Notes: ${(card as any).notes}`);

        const row = await prisma.summary.create({
          data: {
            type: SummaryType.character,
            roleName: (card as any).name,
            content: lines.join("\n") || `• ${(card as any).name}`,
            campaignId: campaign.id,
          },
        });
        createdCharacterSummaries.push({ id: row.id, name: (card as any).name });
      } catch {
        // tolerate per-row failures
      }
    }

    // --- Touch updateDate again (to reflect summary/characters writes) ---
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { updateDate: new Date() },
    });

    // --- Respond with what we actually persisted ---
    return NextResponse.json({
      campaignId: campaign.id,
      allTxtId: allTxt.id,
      summaryId: summaryRow.id,
      title: campaignTitle,
      source: body.source || "live",
      summary: content, // the saved summary text (reused or generated)
      characters,
      characterSummaryIds: createdCharacterSummaries,
    });
  } catch (err: any) {
    console.error("POST /api/analyze error:", err?.message || err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
