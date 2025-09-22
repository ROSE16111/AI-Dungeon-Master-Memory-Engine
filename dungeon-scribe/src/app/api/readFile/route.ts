// src/app/api/readFile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

// ⚠️ 改成你本地 Tesseract.exe 的路径
const TESSERACT_PATH = "G:\\Tesseract\\tesseract.exe";

async function importMammoth() {
  const mod: any = await import("mammoth");
  return mod?.default ?? mod;
}

async function importPdfParse() {
  const mod: any = await import("pdf-parse");
  return mod?.default ?? mod;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // public 下的绝对路径
    const filePath = path.join(
      process.cwd(),
      "public",
      id.replace(/^\/+/, "") // 去掉开头斜杠
    );

    const ext = path.extname(filePath).toLowerCase();
    let text = "";

    if (/\.(png|jpg|jpeg|webp|gif)$/i.test(ext)) {
      // ✅ 图片 → 本地 Tesseract OCR
      const { stdout } = await execFileAsync(TESSERACT_PATH, [
        filePath,
        "stdout",
        "-l",
        "eng",
      ]);
      text = stdout;
    } else if (ext === ".docx") {
      // ✅ Word → mammoth
      const buffer = await fs.readFile(filePath);
      const mammoth = await importMammoth();
      const { value } = await mammoth.extractRawText({ buffer });
      text = value || "";
    } else if (ext === ".pdf") {
      // ✅ PDF → pdf-parse 先尝试
      const buffer = await fs.readFile(filePath);
      const pdfParse = await importPdfParse();
      const out = await pdfParse(buffer);
      text = (out?.text || "").toString();

      if (!text.trim()) {
        // 如果没文字 → fallback 本地 Tesseract OCR
        const { stdout } = await execFileAsync(TESSERACT_PATH, [
          filePath,
          "stdout",
          "-l",
          "eng",
        ]);
        text = stdout;
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: text.trim() || "(No content)" });
  } catch (e: any) {
    console.error("readFile error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
