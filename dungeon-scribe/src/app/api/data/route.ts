// src/app/api/data/route.ts
//http://localhost:3000/api/data
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET Campaign的相关信息或特定Campaign的Roles
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const campaignId = searchParams.get("campaignId");

  try {
    // 获取特定Campaign的Roles
    if (type === "roles" && campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          roles: true,
          summaries: {
            where: { type: "character" },
          },
        },
      });

      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      // 合并角色基本信息和角色总结
      const rolesWithSummaries = campaign.roles.map((role) => {
        const summary = campaign.summaries.find((s) => s.roleName === role.name);
        return {
          id: role.id,
          name: role.name,
          level: role.level,
          details: summary?.content || `Level ${role.level} character. No detailed summary available yet.`,
          img: summary?.imageBase64 ? `data:image/png;base64,${summary.imageBase64}` : "/Griff.png",
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

// 创建 Campaign或Role 
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type } = body;

  try {
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
