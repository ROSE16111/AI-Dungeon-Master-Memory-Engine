// src/app/api/current-campaign/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies as _cookies } from "next/headers";

export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

/** Write current campaign (by id or title) */
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
  const maxAge = remember ? 60 * 60 * 24 * 30 : undefined; // 30 days or session duration
  res.cookies.set("currentCampaignId", id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  });
  return res;
}

/** Read current campaign (get id from httpOnly cookie, then query title) */
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

/** Clear current campaign (for logout; also delete login cookies if applicable) */
export async function DELETE() {
  const jar = await _cookies();
  jar.delete("currentCampaignId");
  return NextResponse.json({ ok: true });
}
