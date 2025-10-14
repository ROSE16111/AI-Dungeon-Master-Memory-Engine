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
};

/**
 * Handle POST requests to summarise a given text transcript.
 *
 * @remarks
 * This endpoint:
 * 1. Parses the request body to extract transcript text and optional metadata.
 * 2. Ensures a campaign record exists in the database (creates if missing).
 * 3. Saves the full transcript text (`allTxt` table).
 * 4. Generates a session summary via the LLM (`summarizeDnDSession`).
 * 5. Stores the summary in the database (`summary` table).
 * 6. Returns JSON with campaign, transcript, and summary IDs, plus summary content.
 *
 * @param req - The incoming request object containing JSON body with transcript and metadata.
 * @returns A JSON response containing campaign/session IDs and the generated summary,
 * or an error response if something goes wrong.
 *
 * @example
 * ```ts
 * const response = await fetch("/api/analyze", {
 *   method: "POST",
 *   body: JSON.stringify({
 *     title: "Session 1",
 *     text: "Long transcript text...",
 *     source: "upload",
 *   }),
 * });
 * const data = await response.json();
 * ```
 */
export async function POST(req: Request) {
  try {
    // Parse request body as AnalyzeBody
    const body = (await req.json()) as AnalyzeBody;

    // Get transcript text and ensure it's not empty
    const text = (body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Empty text" }, { status: 400 });
    }

    // Prefer explicit campaignId if provided (client may pass it), else use title lookup/create
    let campaign = null;
    if (body.campaignId) {
      campaign = await prisma.campaign.findUnique({ where: { id: body.campaignId } });
    }

    const campaignTitle = (body.title || "Untitled Campaign").trim();
    if (!campaign) {
      campaign = await prisma.campaign.findFirst({ where: { title: campaignTitle } });
      if (!campaign) {
        campaign = await prisma.campaign.create({ data: { title: campaignTitle } });
      }
    }

    // Store the raw transcript in the database
    const allTxt = await prisma.allTxt.create({
      data: {
        content: text,
        campaignId: campaign.id,
      },
    });

    // Only update the selected campaign's updateDate using its unique id
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { updateDate: new Date() },
    });

    // Generate summary bullets using the LLM
    const summaryBullets = (await summarizeDnDSession(text)).trim();

    let characters: Awaited<ReturnType<typeof extractCharactersFromSession>> = [];
    try {
      characters = await extractCharactersFromSession(text);
    } catch { /* tolerate LLM hiccups */ }

    // Fallback summary if LLM produced nothing
    const content =
      summaryBullets ||
      "• Summary unavailable. (LLM produced no output)\n• Check Ollama host/model configuration.";

    // Save or update summary in database. If client provided summaryId, update that row.
    let summary;
    if (body.summaryId) {
      // attempt to update existing summary; fall back to create if not found
      try {
        summary = await prisma.summary.update({
          where: { id: body.summaryId },
          data: {
            content,
            campaignId: campaign.id,
            type: SummaryType.session,
          },
        });
      } catch (e) {
        // not found or other error -> create new
        summary = await prisma.summary.create({
          data: {
            type: SummaryType.session,
            content,
            campaignId: campaign.id,
          },
        });
      }
    } else {
      summary = await prisma.summary.create({
        data: {
          type: SummaryType.session,
          content,
          campaignId: campaign.id,
        },
      });
    }

    const createdCharacterSummaries = [];
    for (const card of characters) {
      try {
        const contentLines: string[] = [];
        if (card.role) contentLines.push(`• Role: ${card.role}`);
        if (card.affiliation) contentLines.push(`• Affiliation: ${card.affiliation}`);
        if (card.traits?.length) contentLines.push(`• Traits: ${card.traits.join(", ")}`);
        if (card.goals?.length) contentLines.push(`• Goals: ${card.goals.join("; ")}`);
        if (card.lastLocation) contentLines.push(`• Last location: ${card.lastLocation}`);
        if (card.status) contentLines.push(`• Status: ${card.status}`);
        if (card.notes) contentLines.push(`• Notes: ${card.notes}`);

        const row = await prisma.summary.create({
          data: {
            type: SummaryType.character,
            roleName: card.name,         // store name in roleName for quick filtering
            content: contentLines.join("\n") || `• ${card.name}`,
            campaignId: campaign.id,
          },
        });
        createdCharacterSummaries.push({ id: row.id, name: card.name });
      } catch { /* continue */ }
}


    // Update campaign updateDate again (in case only summary is updated)
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { updateDate: new Date() },
    });

    // Return JSON response with references to stored objects
    return NextResponse.json({
      campaignId: campaign.id,
      allTxtId: allTxt.id,
      summaryId: summary.id,
      title: campaignTitle,
      source: body.source || "live",
      summary:   summaryBullets,
      characters,                         // ← array of structured cards back to client
      characterSummaryIds: createdCharacterSummaries,
    });
  } catch (err: any) {
    // Log and return generic error on failure
    console.error("POST /api/analyse error:", err?.message || err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

