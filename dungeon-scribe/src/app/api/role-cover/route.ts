// src/app/api/role-cover/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/**
 * PATCH /api/role-cover
 * Body(JSON): { id: string, url?: string, imageBase64?: string, mime?: string }
 * - If url is provided, store it as-is.
 * - If only imageBase64 is provided, we make a data URL and store to role.url.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id as string | undefined;
    let url = body?.url as string | undefined;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    // Allow sending raw base64 too (optional)
    if (!url) {
      const b64 = body?.imageBase64 as string | undefined;
      const mime = (body?.mime as string | undefined) || "image/png";
      if (!b64) {
        return NextResponse.json(
          { ok: false, error: "Either url or imageBase64 is required" },
          { status: 400 }
        );
      }
      url = `data:${mime};base64,${b64}`;
    }

    await prisma.role.update({
      where: { id },
      data: { url },
    });

    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message ?? "PATCH failed" }, { status: 500 });
  }
}
