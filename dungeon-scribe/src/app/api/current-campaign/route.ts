// src/app/api/current-campaign/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies as _cookies } from "next/headers";

export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

/** 写入当前战役（通过 id 或 title） */
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
      { ok: false, error: "id or title is required / Campaign not found" },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ ok: true, id });
  const maxAge = remember ? 60 * 60 * 24 * 30 : undefined; // 30天 or 会话期
  res.cookies.set("currentCampaignId", id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  });
  return res;
}

/** 读取当前战役（从 httpOnly cookie 获取 id，再查 title） */
export async function GET() {
  const jar = await _cookies();
  const id = jar.get("currentCampaignId")?.value ?? null;
  if (!id) return NextResponse.json({ ok: true, item: null });

  const camp = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  return NextResponse.json({ ok: true, item: camp ? { id: camp.id, name: camp.title } : null });
}

/** 清除当前战役（登出用；如果你有登录态 cookie，也可以一起删） */
export async function DELETE() {
  const jar = await _cookies();
  jar.delete("currentCampaignId");
  return NextResponse.json({ ok: true });
}
