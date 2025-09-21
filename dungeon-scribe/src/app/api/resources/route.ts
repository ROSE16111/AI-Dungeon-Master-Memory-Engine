import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 确保 uploads 目录存在
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    // 安全文件名
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const savePath = path.join(uploadDir, safeName);
    await fs.writeFile(savePath, buffer);

    // 🚨 注意这里：只返回相对路径，不返回绝对路径
    return NextResponse.json({
      id: safeName,
      url: `/uploads/${safeName}`, // 这一行保证前端拿到的是 /uploads/xxx.pdf
      preview: "/historypp.png",
    });
  } catch (e: any) {
    console.error("Upload error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
