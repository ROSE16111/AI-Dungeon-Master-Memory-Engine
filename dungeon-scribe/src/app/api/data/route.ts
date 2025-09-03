// src/app/api/data/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      roles: true,
      allTxts: true,
      summaries: true,
    },
  });

  return NextResponse.json({ campaigns });
}
