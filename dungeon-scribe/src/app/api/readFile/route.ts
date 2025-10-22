import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

/** ======== 1) External tool paths (modify as needed) ======== */
// Recommended: store in .env and read via process.env
const TESSERACT_PATH =
  process.env.TESSERACT_PATH || "G:\\Tesseract\\tesseract.exe";

// Prefer Poppler’s pdftoppm (common Windows install path examples)
const PDFTOPPM_CANDIDATES = [
  process.env.PDFTOPPM_PATH, // specify in your .env if available
  "D:\\poppler\\Library\\bin\\pdftoppm.exe",
  "D:\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe",
  "pdftoppm", // already added to PATH
].filter(Boolean) as string[];

/** ======== 2) Utility functions ======== */
function extnameLower(p: string) {
  return path.extname(p).toLowerCase();
}

function ensureUploadsRelative(id: string) {
  // Safety: only allow access to /uploads/* under public
  const clean = id.replace(/^(\.\.[/\\])+/, "").replace(/^\/+/, "");
  if (!clean.startsWith("uploads/")) {
    throw new Error("Invalid path: only /uploads/* is allowed.");
  }
  return clean;
}

// Run Tesseract (image → text)
async function runTesseract(
  imageAbsPath: string,
  lang = "eng"
): Promise<string> {
  // tesseract input outputbase -l eng --psm 3
  // Use stdout: output text to stdout (use '-' as outputbase)
  const args = [imageAbsPath, "stdout", "-l", lang, "--psm", "3"];
  const { stdout } = await execFileAsync(TESSERACT_PATH, args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
  });
  return stdout || "";
}

// Try to locate a working pdftoppm
async function resolvePdftoppm(): Promise<string | null> {
  for (const candidate of PDFTOPPM_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(candidate, ["-v"], {
        windowsHide: true,
      });
      if (stdout != null || true) return candidate; // if runnable, consider it usable
    } catch {
      // ignore and continue
    }
  }
  return null;
}

// PDF → multiple PNG pages (return absolute paths for each page)
async function pdfToPngs(pdfAbsPath: string, dpi = 300): Promise<string[]> {
  const pdftoppm = await resolvePdftoppm();
  if (!pdftoppm)
    throw new Error(
      "pdftoppm (Poppler) not found. Please install Poppler and set PDFTOPPM_PATH."
    );

  // Output to temporary directory (.next/server for safety)
  const outDir = path.join(process.cwd(), ".next", "tmp", "pdfpng");
  await fs.mkdir(outDir, { recursive: true });
  const baseName = path.basename(pdfAbsPath, path.extname(pdfAbsPath));
  const outBase = path.join(outDir, `${baseName}-${Date.now()}`);

  // pdftoppm -png -r 300 input.pdf outputbase
  await execFileAsync(
    pdftoppm,
    ["-png", "-r", String(dpi), pdfAbsPath, outBase],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 64,
    }
  );

  // pdftoppm output filenames like: outBase-1.png, outBase-2.png ...
  const files = await fs.readdir(path.dirname(outBase));
  const pngs = files
    .filter(
      (f) => f.startsWith(path.basename(outBase) + "-") && f.endsWith(".png")
    )
    .map((f) => path.join(path.dirname(outBase), f))
    .sort((a, b) => {
      const na = parseInt(a.split("-").pop()!.replace(".png", ""), 10);
      const nb = parseInt(b.split("-").pop()!.replace(".png", ""), 10);
      return na - nb;
    });

  if (pngs.length === 0) throw new Error("No PNG pages produced from PDF.");
  return pngs;
}

// Fallback: extract text directly using Poppler’s pdftotext (no OCR needed)
const PDFTOTEXT_CANDIDATES = [
  process.env.PDFTOTEXT_PATH, // specify in your .env
  "D:\\poppler\\Library\\bin\\pdftotext.exe",
  "D:\\poppler-25.07.0\\Library\\bin\\pdftotext.exe",
  "pdftotext", // already added to PATH
].filter(Boolean) as string[];

async function resolvePdftotext(): Promise<string | null> {
  for (const c of PDFTOTEXT_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(c, ["-v"], { windowsHide: true });
      if (stdout != null || true) return c; // if runnable, consider it usable
    } catch {}
  }
  return null;
}

async function extractPdfTextByPoppler(pdfAbsPath: string): Promise<string> {
  const pdftotext = await resolvePdftotext();
  if (!pdftotext) throw new Error("pdftotext not found");
  // -layout preserves layout, -enc UTF-8 outputs to stdout ('-')
  const args = ["-layout", "-enc", "UTF-8", pdfAbsPath, "-"];
  const { stdout } = await execFileAsync(pdftotext, args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
  });
  return (stdout || "").toString();
}

/** ======== 3) Main handler logic ======== */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id"); // e.g., /uploads/xxx.pdf
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Only allow files under public/uploads
    const safeRel = ensureUploadsRelative(id.replace(/^\/+/, "")); // remove leading slash
    const absPath = path.join(process.cwd(), "public", safeRel);

    // Check file existence
    try {
      await fs.access(absPath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = extnameLower(absPath);

    // ============ A) Image: direct Tesseract ============
    if (
      [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"].includes(ext)
    ) {
      const text = await runTesseract(absPath, "eng"); // for Chinese, use "chi_sim+eng"
      return NextResponse.json({ ok: true, type: "image", text });
    }

    // ============ B) Word: use mammoth ============
    if (ext === ".docx") {
      try {
        // 👇 Type hint compatibility
        const mammoth: any = await import("mammoth");
        const buf = await fs.readFile(absPath);
        // Keep your existing method: convertToMarkdown
        const { value } = await mammoth.convertToMarkdown({ buffer: buf });
        return NextResponse.json({ ok: true, type: "docx", text: value || "" });
      } catch (e) {
        return NextResponse.json(
          { error: "DOCX read failed: " + (e as Error).message },
          { status: 500 }
        );
      }
    }

    if (ext === ".doc") {
      // .doc legacy format: suggest converting to .docx; could integrate libreoffice conversion
      return NextResponse.json(
        { error: ".doc is not supported. Please convert to .docx." },
        { status: 415 }
      );
    }

    // ============ C) PDF: render as images → OCR ============
    if (ext === ".pdf") {
      try {
        // 1) PDF → PNG (requires Poppler’s pdftoppm)
        const pages = await pdfToPngs(absPath, 300);

        // 2) Page-by-page OCR (serial for stability; can parallelize with throttling)
        let total = "";
        for (let i = 0; i < pages.length; i++) {
          const pagePath = pages[i];
          const pageText = await runTesseract(pagePath, "eng"); // use "chi_sim+eng" for Chinese
          total +=
            `\n\n===== Page ${i + 1}/${pages.length} =====\n` + pageText.trim();
        }

        return NextResponse.json({
          ok: true,
          type: "pdf-ocr",
          pages: pages.length,
          text: total.trim(),
        });
      } catch (ocrErr: any) {
        // Fallback: try extracting text directly (some PDFs already have selectable text)
        try {
          const direct = await extractPdfTextByPoppler(absPath);
          if (direct.trim()) {
            return NextResponse.json({
              ok: true,
              type: "pdf-text",
              text: direct,
              note: "pdftoppm not available or OCR failed; returned direct text via Poppler.",
            });
          }
        } catch {
          // ignore
        }
        return NextResponse.json(
          { error: "PDF OCR failed: " + ocrErr?.message },
          { status: 500 }
        );
      }
    }

    // Other file types: unsupported
    return NextResponse.json(
      { error: `Unsupported file type: ${ext || "unknown"}` },
      { status: 415 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
