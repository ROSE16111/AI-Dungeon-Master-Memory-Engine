import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies as _cookies } from "next/headers";

export const dynamic = "force-dynamic"; // 防止被静态缓存

const prisma = new PrismaClient();

/** POST /api/current-campaign
 * body: { id?: string, title?: string, remember?: boolean }
 * 写入 httpOnly Cookie: currentCampaignId
 */
export async function POST(req: Request) {
  const { id: rawId, title, remember } = await req.json();

  let id: string | undefined = rawId;

  if (!id && title) {
    const found = await prisma.campaign.findFirst({
      where: { title },
      select: { id: true },
    });
    id = found?.id;
  }

  if (!id) {
    return NextResponse.json(
      { error: "id or title is required / Campaign not found" },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ ok: true });

  const maxAge = remember ? 60 * 60 * 24 * 30 : undefined; // 30天或会话期
  res.cookies.set("currentCampaignId", id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  });

  return res;
}

/** GET /api/current-campaign
 * 从 Cookie 读取 id，再查 title
 */
export async function GET() {
  const store = await _cookies(); // 某些版本必须 await
  const id = store.get("currentCampaignId")?.value ?? null;

  if (!id) return NextResponse.json({ id: null, title: null });

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, title: true },
  });

  return NextResponse.json(campaign ?? { id: null, title: null });
}
