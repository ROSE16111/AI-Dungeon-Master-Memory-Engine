// src/app/api/data/route.ts
//http://localhost:3000/api/data
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SummaryType } from "@prisma/client";

// GET Campaign的相关信息或特定Campaign的Roles
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const campaignId = searchParams.get("campaignId");

  try {
    // 获取特定Campaign的Roles
    // GET /api/data?type=roles&campaignId=...
    if (type === "roles" && campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          roles: true,
          summaries: true, // get all summaries
        },
      });

      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      const charSummaries = campaign.summaries.filter(
        (s) => s.type === "character" && s.roleName
      );

      // Maps for easy lookup
      const roleByName = new Map(campaign.roles.map((r) => [r.name, r]));
      const summaryByName = new Map(
        charSummaries.map((s) => [s.roleName as string, s])
      );

      const rolesWithSummaries = Array.from(summaryByName.keys()).map((name) => {
        const role = roleByName.get(name);
        const summary = summaryByName.get(name)!;
        return {
          id: role?.id ?? `summary:${summary.id}`,
          name,
          level: role?.level ?? null,
          details: summary.content || "No detailed summary available yet.",
          img: summary.imageBase64
            ? `data:image/png;base64,${summary.imageBase64}`
            : "/Griff.png",
        };
      });

      return NextResponse.json({ roles: rolesWithSummaries });
    }

    // 默认获取所有Campaigns
    const campaigns = await prisma.campaign.findMany({
      include: {
        roles: true,
        allTxts: true,
        summaries: true,
      },
      orderBy: {
        startDate: "asc",
      },
    });

    const result = campaigns.map((campaign) => {
      const sessionSummaries = campaign.summaries.filter(
        (s) => s.type === "session"
      );
      const characterSummaries = campaign.summaries.filter(
        (s) => s.type === "character"
      );

      return {
        id: campaign.id,
        title: campaign.title,
        startDate: campaign.startDate,
        updateDate: campaign.updateDate,
        roles: campaign.roles,
        allTxts: campaign.allTxts,
        sessionSummaries: sessionSummaries.map((s) => ({
          id: s.id,
          content: s.content,
          imageBase64: s.imageBase64,
          createdAt: s.createdAt,
        })),
        characterSummaries: characterSummaries.map((s) => ({
          id: s.id,
          roleName: s.roleName,
          content: s.content,
          imageBase64: s.imageBase64,
          createdAt: s.createdAt,
        })),
      };
    });

    return NextResponse.json({ campaigns: result });
  } catch (err) {
    console.error("GET /api/data error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// 创建 Campaign或Role,更改summary
export async function POST(req: NextRequest) {
  const body = await req.json();
  const url = new URL(req.url);
  const typeFromQuery = url.searchParams.get("type");
  const { type: typeFromBody } = body;
  const type = (typeFromBody || typeFromQuery) as string | null;

  try {
    // Handle saving/updating a session summary via unified data API
    if (type === "summary") {
      const { campaignId, content, summaryId } = body;
      if (!campaignId || !content) {
        return NextResponse.json({ error: "campaignId and content are required" }, { status: 400 });
      }

      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      let summary;

      // If a specific summaryId is provided, prefer updating that record (safer for edits)
      if (summaryId) {
        const existing = await prisma.summary.findUnique({ where: { id: summaryId } });
        if (existing && existing.campaignId === campaignId) {
          summary = await prisma.summary.update({ where: { id: summaryId }, data: { content } });
        } else {
          return NextResponse.json({ error: "Summary not found or does not belong to campaign" }, { status: 404 });
        }
      } else {
        // Otherwise find latest session summary and update it, or create if none
        const latest = await prisma.summary.findFirst({
          where: { campaignId, type: SummaryType.session },
          orderBy: { createdAt: "desc" },
        });

        if (latest) {
          summary = await prisma.summary.update({ where: { id: latest.id }, data: { content } });
        } else {
          summary = await prisma.summary.create({ data: { type: SummaryType.session, content, campaignId } });
        }
      }

      await prisma.campaign.update({ where: { id: campaignId }, data: { updateDate: new Date() } });
      return NextResponse.json({ ok: true, summary });
    }
    // 创建Campaign
    if (type === "campaign") {
      const { title } = body;
      if (!title) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
      }

      const existing = await prisma.campaign.findFirst({ where: { title } });
      if (existing) {
        return NextResponse.json({ error: "Campaign already exists" }, { status: 409 });
      }

      const newCampaign = await prisma.campaign.create({
        data: { title },
      });

      return NextResponse.json({ campaign: newCampaign });
    }

    // 创建Role
    if (type === "role") {
      const { campaignTitle, name } = body;
      if (!campaignTitle || !name) {
        return NextResponse.json({ error: "Missing campaignTitle or role name" }, { status: 400 });
      }

      const campaign = await prisma.campaign.findFirst({ where: { title: campaignTitle } });
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      const existingRole = await prisma.role.findFirst({
        where: { name, campaignId: campaign.id },
      });
      if (existingRole) {
        return NextResponse.json({ error: "Role already exists" }, { status: 409 });
      }

      const role = await prisma.role.create({
        data: {
          name,
          level: 1,
          campaignId: campaign.id,
        },
      });

      return NextResponse.json({ role });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  } catch (err) {
    console.error("POST /api/data error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE a summary or transcript by id
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Try to find and delete a Summary first
    const existingSummary = await prisma.summary.findUnique({ where: { id } });
    if (existingSummary) {
      await prisma.summary.delete({ where: { id } });
      try {
        // Update campaign updateDate
        if (existingSummary.campaignId) {
          await prisma.campaign.update({ where: { id: existingSummary.campaignId }, data: { updateDate: new Date() } });
        }
      } catch {}
      return NextResponse.json({ ok: true, deleted: { type: "summary", id } });
    }

    // If not a summary, try AllTxt
    const existingAll = await prisma.allTxt.findUnique({ where: { id } });
    if (existingAll) {
      await prisma.allTxt.delete({ where: { id } });
      try {
        if (existingAll.campaignId) {
          await prisma.campaign.update({ where: { id: existingAll.campaignId }, data: { updateDate: new Date() } });
        }
      } catch {}
      return NextResponse.json({ ok: true, deleted: { type: "allTxt", id } });
    }

    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  } catch (err) {
    console.error("DELETE /api/data error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
