// src/app/api/resources/[id]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient, ResourceCategory } from "@prisma/client";
import { cookies } from "next/headers";

const prisma = new PrismaClient();

async function getCurrentCampaignId(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get("currentCampaignId")?.value?.trim();
  return v || null;
}

/** GET /api/resources/:id  读取单条资源（受当前战役限制） */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = await getCurrentCampaignId();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "no current campaign" }, { status: 401 });
    }

    const r = await prisma.resource.findFirst({
      where: { id: params.id, campaignId },
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        previewUrl: true,
        gridCols: true, // 如果你没在 schema 里加这两个字段，删掉即可
        gridRows: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!r) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: r }, { status: 200 });
  } catch (e: any) {
    console.error("RESOURCES_[ID]_GET_ERROR", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "get failed" }, { status: 500 });
  }
}

/** DELETE /api/resources/:id  删除单条资源（受当前战役限制） */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = await getCurrentCampaignId();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "no current campaign" }, { status: 401 });
    }

    // 先检查是否属于当前战役
    const exist = await prisma.resource.findFirst({
      where: { id: params.id, campaignId },
      select: { id: true },
    });
    if (!exist) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    await prisma.resource.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("RESOURCES_[ID]_DELETE_ERROR", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "delete failed" }, { status: 500 });
  }
}

/** PATCH /api/resources/:id
 *  接收 JSON 部分更新：
 *  { gridCols?, gridRows?, lightI?, lightJ?, lightRadius? }
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const campaignId = await getCurrentCampaignId();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "no current campaign" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const data: any = {};

    // 只允许更新这几个字段（其他字段忽略）
    if (typeof body.gridCols === "number") data.gridCols = Math.max(1, Math.floor(body.gridCols));
    if (typeof body.gridRows === "number") data.gridRows = Math.max(1, Math.floor(body.gridRows));
    if (typeof body.lightI === "number")   data.lightI = Math.max(0, Math.floor(body.lightI));
    if (typeof body.lightJ === "number")   data.lightJ = Math.max(0, Math.floor(body.lightJ));
    if (typeof body.lightRadius === "number") data.lightRadius = Math.max(1, Math.floor(body.lightRadius));

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "no valid fields" }, { status: 400 });
    }

    // 先确保这条资源属于当前战役
    const exist = await prisma.resource.findFirst({
      where: { id: params.id, campaignId },
      select: { id: true },
    });
    if (!exist) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

    const updated = await prisma.resource.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ ok: true, item: updated }, { status: 200 });
  } catch (e: any) {
    console.error("RESOURCES_[ID]_PATCH_ERROR", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "patch failed" }, { status: 500 });
  }
}