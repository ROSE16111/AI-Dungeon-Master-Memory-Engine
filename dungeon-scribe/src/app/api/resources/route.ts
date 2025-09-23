// src/app/api/resources/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ResourceCategory } from "@prisma/client";
import { cookies } from "next/headers"; // ✅ 新增：用来读取登录时写入的 currentCampaignId

export const runtime = "nodejs";
// 允许动态（避免缓存）
export const dynamic = "force-dynamic";

/** 小工具：把字符串安全映射到 Prisma 的枚举 */
function toResourceCategory(x: string | null): ResourceCategory | null {
  if (!x) return null;
  const v = x.trim();
  if (v === "Map") return ResourceCategory.Map;
  if (v === "Background") return ResourceCategory.Background;
  if (v === "Others") return ResourceCategory.Others;
  return null;
}

/** 生成一个安全的文件名（避免中文/空格/特殊字符 + 防重名） */
function safeFileName(name: string) {
  const base = (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const dot = base.lastIndexOf(".");
  const stamp = `_${Date.now()}`;
  if (dot === -1) return base + stamp;
  return base.slice(0, dot) + stamp + base.slice(dot);
}

/** 小工具：从 Cookie 里拿当前战役 ID；没有就返回 null */
// ✅ 新（Next.js 15：cookies() -> Promise）
async function getCurrentCampaignIdFromCookie(): Promise<string | null> {
  const jar = await cookies(); // <- 需要 await
  const v = jar.get("currentCampaignId")?.value ?? "";
  return v.trim() || null;
}

/** GET /api/resources?category=Map
 *  读取“当前战役”（通过 Cookie: currentCampaignId）的资源列表。
 *  可选用 ?category=Map|Background|Others 做分类过滤。
 *  这里不做分页，前端用 6/页轮播即可。
 */
export async function GET(req: NextRequest) {
  try {
    // ✅ 1) 从 Cookie 拿当前战役 ID
    const campaignId = await getCurrentCampaignIdFromCookie();
    if (!campaignId) {
      // 没有登录态或没有写 Cookie，就不给数据
      return NextResponse.json(
        { ok: false, error: "no current campaign (cookie missing)" },
        { status: 401 }
      );
    }

    // ✅ 2) 可选分类过滤
    const { searchParams } = new URL(req.url);
    const c = toResourceCategory(searchParams.get("category"));

    // ✅ 3) 组合 where
    const where = {
      campaignId,         // 只查当前战役
      ...(c ? { category: c } : {}),
    };

    // ✅ 4) 查询并返回
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
      take: 100, // 防止一次性太多
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
 *  接收 FormData：name, category, file
 *  注意：不再信任前端传的 campaignId，而是以 Cookie: currentCampaignId 为准
 *  流程：
 *   1) 校验字段 & 校验 Cookie 的战役存在
 *   2) 保存文件到 public/uploads
 *   3) 生成 preview（图片则用本身，否则默认图）
 *   4) prisma.resource.create 入库（挂到当前战役）
 *   5) 返回 { id, url, preview, item }（与前端 handleCreate 期望一致）
 */
export async function POST(req: NextRequest) {
  try {
    // ✅ 0) 当前战役 ID（来自 Cookie）
    const campaignId = await getCurrentCampaignIdFromCookie();
    if (!campaignId) {
      return NextResponse.json(
        { error: "no current campaign (cookie missing)" },
        { status: 401 }
      );
    }

    // 有些情况下用户改了 Cookie 或战役被删了，这里做存在性校验更稳
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

    // ✅ 1) 解析表单
    const form = await req.formData();
    const name = (form.get("name") as string | null)?.trim() || "";
    const categoryStr = form.get("category") as string | null;
    const file = form.get("file") as File | null;

    // ✅ 2) 校验
    const cat = toResourceCategory(categoryStr);
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!cat) return NextResponse.json({ error: "invalid category" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    // ✅ 3) 保存文件到 public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = safeFileName(file.name || "upload.bin");
    const savePath = path.join(uploadDir, safeName);

    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(savePath, Buffer.from(arrayBuffer));

    // 对外可访问的 URL（/public 是静态资源根）
    const fileUrl = `/uploads/${safeName}`;

    // ✅ 4) 预览：如果是图片（mime 以 image/ 开头），就用它自己；否则使用默认缩略图
    const isImage = (file.type || "").startsWith("image/");
    const previewUrl = isImage ? fileUrl : "/historypp.png";

    // ✅ 5) 入库（挂到当前战役）
    const row = await prisma.resource.create({
      data: {
        title: name,
        category: cat,
        fileUrl,
        previewUrl,
        campaignId: campaignId, // <-- 关键：一律以 Cookie 中的当前战役为准
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

    // ✅ 6) 返回给前端（结构与 handleCreate 期望一致）
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
