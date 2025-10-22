// src/app/api/resources/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ResourceCategory } from "@prisma/client";
import { cookies } from "next/headers"; // ✅ Added: used to read currentCampaignId set during login

export const runtime = "nodejs";
// Allow dynamic (avoid caching)
export const dynamic = "force-dynamic";

/** Utility: safely map a string to Prisma enum */
function toResourceCategory(x: string | null): ResourceCategory | null {
  if (!x) return null;
  const v = x.trim();
  if (v === "Map") return ResourceCategory.Map;
  if (v === "Background") return ResourceCategory.Background;
  if (v === "Others") return ResourceCategory.Others;
  return null;
}

/** Generate a safe filename (avoid Chinese, spaces, special characters + prevent duplicates) */
function safeFileName(name: string) {
  const base = (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const dot = base.lastIndexOf(".");
  const stamp = `_${Date.now()}`;
  if (dot === -1) return base + stamp;
  return base.slice(0, dot) + stamp + base.slice(dot);
}

/** Utility: get current campaign ID from Cookie; return null if missing */
// ✅ New (Next.js 15: cookies() -> Promise)
async function getCurrentCampaignIdFromCookie(): Promise<string | null> {
  const jar = await cookies(); // <- must await
  const v = jar.get("currentCampaignId")?.value ?? "";
  return v.trim() || null;
}

/** GET /api/resources?category=Map
 *  Fetch resource list for the "current campaign" (via Cookie: currentCampaignId).
 *  Optionally filter with ?category=Map|Background|Others.
 *  No pagination here, frontend uses 6 items per page carousel.
 */
export async function GET(req: NextRequest) {
  try {
    // ✅ 1) Get current campaign ID from Cookie
    const campaignId = await getCurrentCampaignIdFromCookie();
    if (!campaignId) {
      // No login state or missing Cookie -> deny access
      return NextResponse.json(
        { ok: false, error: "no current campaign (cookie missing)" },
        { status: 401 }
      );
    }

    // ✅ 2) Optional category filter
    const { searchParams } = new URL(req.url);
    const c = toResourceCategory(searchParams.get("category"));

    // ✅ 3) Compose where condition
    const where = {
      campaignId,         // Only query current campaign
      ...(c ? { category: c } : {}),
    };

    // ✅ 4) Query and return
    const rows = await prisma.resource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        previewUrl: true,
        createdAt: true,
        campaignId: true,
      },
      take: 100, // Prevent too many results at once
    });

    return NextResponse.json({ ok: true, items: rows }, { status: 200 });
  } catch (e: any) {
    console.error("RESOURCES_GET_ERROR", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "get failed" },
      { status: 500 }
    );
  }
}

/** POST /api/resources
 *  Accepts FormData: name, category, file
 *  Note: no longer trusts campaignId from frontend; uses Cookie: currentCampaignId instead.
 *  Process:
 *   1) Validate fields & check campaign existence
 *   2) Save file to public/uploads
 *   3) Generate preview (use image itself if applicable, otherwise default)
 *   4) prisma.resource.create to insert (attach to current campaign)
 *   5) Return { id, url, preview, item } (matches frontend handleCreate expectation)
 */
export async function POST(req: NextRequest) {
  try {
    // ✅ 0) Current campaign ID (from Cookie)
    const campaignId = await getCurrentCampaignIdFromCookie();
    if (!campaignId) {
      return NextResponse.json(
        { error: "no current campaign (cookie missing)" },
        { status: 401 }
      );
    }

    // Validate existence (user might have modified Cookie or campaign deleted)
    const cmp = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!cmp) {
      return NextResponse.json(
        { error: "campaign not found" },
        { status: 400 }
      );
    }

    // ✅ 1) Parse form
    const form = await req.formData();
    const name = (form.get("name") as string | null)?.trim() || "";
    const categoryStr = form.get("category") as string | null;
    const file = form.get("file") as File | null;

    // ✅ 2) Validate
    const cat = toResourceCategory(categoryStr);
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!cat) return NextResponse.json({ error: "invalid category" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    // ✅ 3) Save file to public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = safeFileName(file.name || "upload.bin");
    const savePath = path.join(uploadDir, safeName);

    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(savePath, Buffer.from(arrayBuffer));

    // Publicly accessible URL (/public is static root)
    const fileUrl = `/uploads/${safeName}`;

    // ✅ 4) Preview: if image (mime starts with image/), use itself; otherwise default thumbnail
    const isImage = (file.type || "").startsWith("image/");
    const previewUrl = isImage ? fileUrl : "/historypp.png";

    // ✅ 5) Insert into DB (attach to current campaign)
    const row = await prisma.resource.create({
      data: {
        title: name,
        category: cat,
        fileUrl,
        previewUrl,
        campaignId: campaignId, // <-- Key: always rely on current campaign from Cookie
      },
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        previewUrl: true,
        createdAt: true,
        campaignId: true,
      },
    });

    // ✅ 6) Return response to frontend (structure matches handleCreate expectation)
    return NextResponse.json(
      { id: row.id, url: row.fileUrl, preview: row.previewUrl, item: row },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("RESOURCES_POST_ERROR", e);
    return NextResponse.json(
      { error: e?.message ?? "upload failed" },
      { status: 500 }
    );
  }
}
