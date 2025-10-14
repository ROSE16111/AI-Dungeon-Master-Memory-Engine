// src/app/api/resources/[id]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import path from "path";
import { unlink } from "fs/promises";

export const runtime = "nodejs";
const prisma = new PrismaClient();

/** 从 cookie 里取当前战役 ID（没有就返回 null） */
async function getCurrentCampaignId(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get("currentCampaignId")?.value?.trim();
  return v || null;
}

/** GET /api/resources/:id —— 读取单条资源（受当前战役限制） */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // Next 15: params 是 Promise
) {
  try {
    const { id } = await ctx.params; // 先 await
    const campaignId = await getCurrentCampaignId();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "no current campaign" }, { status: 401 });
    }

    const r = await prisma.resource.findFirst({
      where: { id, campaignId },
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        previewUrl: true,
        gridCols: true,   // 若 schema 未添加这些字段，请删掉对应行
        gridRows: true,
        lightI: true,
        lightJ: true,
        lightRadius: true,
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

/** DELETE /api/resources/:id —— 删除单条资源（受当前战役限制） */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const campaignId = await getCurrentCampaignId();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "no current campaign" }, { status: 401 });
    }

    // 校验归属，并取出 fileUrl 以便删除本地文件
    const exist = await prisma.resource.findFirst({
      where: { id, campaignId },
      select: { id: true, fileUrl: true },
    });
    if (!exist) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    // 若是我们本地 /public/uploads 下的文件，同时删除文件（失败忽略）
    const fileUrl = exist.fileUrl || "";
    if (fileUrl && /^\/uploads\//.test(fileUrl)) {
      const rel = fileUrl.replace(/^\//, ""); // 去掉开头的 /
      const abs = path.join(process.cwd(), "public", rel);
      await unlink(abs).catch(() => {});
    }

    // 删库
    await prisma.resource.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("RESOURCES_[ID]_DELETE_ERROR", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "delete failed" }, { status: 500 });
  }
}

/** PATCH /api/resources/:id —— 部分更新
 * 接收 JSON：
 * { gridCols?, gridRows?, lightI?, lightJ?, lightRadius? }
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const campaignId = await getCurrentCampaignId();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "no current campaign" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const data: Record<string, number> = {};

    // 只允许这些字段（其余忽略），同时做基础约束
    if (typeof body.gridCols === "number")   data.gridCols   = Math.max(1, Math.floor(body.gridCols));
    if (typeof body.gridRows === "number")   data.gridRows   = Math.max(1, Math.floor(body.gridRows));
    if (typeof body.lightI === "number")     data.lightI     = Math.max(0, Math.floor(body.lightI));
    if (typeof body.lightJ === "number")     data.lightJ     = Math.max(0, Math.floor(body.lightJ));
    if (typeof body.lightRadius === "number")data.lightRadius= Math.max(1, Math.floor(body.lightRadius));

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "no valid fields" }, { status: 400 });
    }

    // 先确认归属
    const exist = await prisma.resource.findFirst({
      where: { id, campaignId },
      select: { id: true },
    });
    if (!exist) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    // 更新
    const updated = await prisma.resource.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        previewUrl: true,
        gridCols: true,
        gridRows: true,
        lightI: true,
        lightJ: true,
        lightRadius: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, item: updated }, { status: 200 });
  } catch (e: any) {
    console.error("RESOURCES_[ID]_PATCH_ERROR", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "patch failed" }, { status: 500 });
  }
}
