// src/app/api/summary-cover/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";     // allow dynamic
export const runtime = "nodejs";            // we use node runtime (safe choice)

const prisma = new PrismaClient();

/**
 * PATCH /api/summary-cover
 * Body(JSON): { id: string, imageBase64: string }
 * Updates the cover image (base64) for a summary/session record.
 */
export async function PATCH(req: Request) {
  try {
    const { id, imageBase64 } = await req.json();

    if (!id || !imageBase64) {
      return NextResponse.json(
        { ok: false, error: "id and imageBase64 are required" },
        { status: 400 }
      );
    }


    await prisma.summary.update({
      where: { id },
      data: { imageBase64 }, // cover the old value
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "PATCH failed" },
      { status: 500 }
    );
  }
}
