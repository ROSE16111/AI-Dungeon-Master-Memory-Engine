// src/app/api/resources/[id]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import path from "path";
import { unlink } from "fs/promises";

export const runtime = "nodejs";
const prisma = new PrismaClient();

/** Get current campaign ID from cookie (return null if missing) */
async function getCurrentCampaignId(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get("currentCampaignId")?.value?.trim();
  return v || null;
}

/** GET /api/resources/:id — Read a single resource (restricted to current campaign) */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // Next 15: params is a Promise
) {
  try {
    const { id } = await ctx.params; // await first
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
        gridCols: true,   // If schema doesn't have these fields, remove corresponding lines
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

/** DELETE /api/resources/:id — Delete a single resource (restricted to current campaign) */
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

    // Verify ownership and retrieve fileUrl for deletion
    const exist = await prisma.resource.findFirst({
      where: { id, campaignId },
      select: { id: true, fileUrl: true },
    });
    if (!exist) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    // If it's a local /public/uploads file, delete the file as well (ignore failure)
    const fileUrl = exist.fileUrl || "";
    if (fileUrl && /^\/uploads\//.test(fileUrl)) {
      const rel = fileUrl.replace(/^\//, ""); // remove leading slash
      const abs = path.join(process.cwd(), "public", rel);
      await unlink(abs).catch(() => {});
    }

    // Delete from database
    await prisma.resource.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("RESOURCES_[ID]_DELETE_ERROR", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "delete failed" }, { status: 500 });
  }
}

/** PATCH /api/resources/:id — Partial update
 * Accepts JSON:
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

    // Only allow these fields (ignore others) and apply basic constraints
    if (typeof body.gridCols === "number")   data.gridCols   = Math.max(1, Math.floor(body.gridCols));
    if (typeof body.gridRows === "number")   data.gridRows   = Math.max(1, Math.floor(body.gridRows));
    if (typeof body.lightI === "number")     data.lightI     = Math.max(0, Math.floor(body.lightI));
    if (typeof body.lightJ === "number")     data.lightJ     = Math.max(0, Math.floor(body.lightJ));
    if (typeof body.lightRadius === "number")data.lightRadius= Math.max(1, Math.floor(body.lightRadius));

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "no valid fields" }, { status: 400 });
    }

    // Verify ownership
    const exist = await prisma.resource.findFirst({
      where: { id, campaignId },
      select: { id: true },
    });
    if (!exist) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    // Update record
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
