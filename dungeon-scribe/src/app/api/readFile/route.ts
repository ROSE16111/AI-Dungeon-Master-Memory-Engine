import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

/** ======== 1) 外部工具路径（按需修改） ======== */
// 建议放到 .env 里，然后用 process.env 读
const TESSERACT_PATH =
  process.env.TESSERACT_PATH || "G:\\Tesseract\\tesseract.exe";

// 优先使用 Poppler 的 pdftoppm（Windows 常见安装路径示例）
const PDFTOPPM_CANDIDATES = [
  process.env.PDFTOPPM_PATH, // 你自己在 .env 指定
  "D:\\poppler\\Library\\bin\\pdftoppm.exe",
  "D:\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe",
  "pdftoppm", // 已加到 PATH
].filter(Boolean) as string[];

/** ======== 2) 工具函数 ======== */
function extnameLower(p: string) {
  return path.extname(p).toLowerCase();
}

function ensureUploadsRelative(id: string) {
  // 安全：只允许访问 public 下的 /uploads/*
  const clean = id.replace(/^(\.\.[/\\])+/, "").replace(/^\/+/, "");
  if (!clean.startsWith("uploads/")) {
    throw new Error("Invalid path: only /uploads/* is allowed.");
  }
  return clean;
}

// 运行 Tesseract（图片→文字）
async function runTesseract(
  imageAbsPath: string,
  lang = "eng"
): Promise<string> {
  // tesseract input outputbase -l eng --psm 3
  // 我们用 stdout：设置输出为 txt 到 stdout（用 '-' 作为 outputbase）
  const args = [imageAbsPath, "stdout", "-l", lang, "--psm", "3"];
  const { stdout } = await execFileAsync(TESSERACT_PATH, args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
  });
  return stdout || "";
}

// 尝试找到可用的 pdftoppm
async function resolvePdftoppm(): Promise<string | null> {
  for (const candidate of PDFTOPPM_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(candidate, ["-v"], {
        windowsHide: true,
      });
      if (stdout != null || true) return candidate; // 能运行就认为可用
    } catch {
      // ignore and continue
    }
  }
  return null;
}

// PDF → 多页 PNG（返回每一页的绝对路径）
async function pdfToPngs(pdfAbsPath: string, dpi = 300): Promise<string[]> {
  const pdftoppm = await resolvePdftoppm();
  if (!pdftoppm)
    throw new Error(
      "pdftoppm (Poppler) not found. Please install Poppler and set PDFTOPPM_PATH."
    );

  // 输出到临时目录（.next/server 下安全）
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

  // pdftoppm 生成的文件名形如：outBase-1.png, outBase-2.png ...
  // 列目录找匹配项
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

// 兜底：用 pdfjs 直接抽取文字（不经 OCR）
// async function extractPdfTextByPdfjs(pdfAbsPath: string): Promise<string> {
//   try {
//     const pdfjsLib = await import("pdfjs-dist");
//     // 一些运行环境需要设置 workerSrc，这里用 node 的默认打包流程通常可省略
//     // @ts-ignore
//     const loadingTask = pdfjsLib.getDocument(pdfAbsPath as any);
//     const pdf = await loadingTask.promise;

//     let out = "";
//     for (let i = 1; i <= pdf.numPages; i++) {
//       const page = await pdf.getPage(i);
//       const content = await page.getTextContent();
//       const strings = content.items.map((it: any) => it.str).filter(Boolean);
//       out += strings.join(" ") + "\n\n";
//     }
//     return out.trim();
//   } catch (e) {
//     throw new Error("pdfjs extract failed: " + (e as Error).message);
//   }
// }
// 兜底：用 Poppler 的 pdftotext 直接抽文字（不需要 pdfjs / canvas）
const PDFTOTEXT_CANDIDATES = [
  process.env.PDFTOTEXT_PATH, // 你可以在 .env 指定
  "D:\\poppler\\Library\\bin\\pdftotext.exe",
  "D:\\poppler-25.07.0\\Library\\bin\\pdftotext.exe",
  "pdftotext", // 已加入 PATH
].filter(Boolean) as string[];

async function resolvePdftotext(): Promise<string | null> {
  for (const c of PDFTOTEXT_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(c, ["-v"], { windowsHide: true });
      if (stdout != null || true) return c; // 能运行就认为可用
    } catch {}
  }
  return null;
}

async function extractPdfTextByPoppler(pdfAbsPath: string): Promise<string> {
  const pdftotext = await resolvePdftotext();
  if (!pdftotext) throw new Error("pdftotext not found");
  // -layout 保持大致排版，-enc UTF-8 输出到 stdout（'-'）
  const args = ["-layout", "-enc", "UTF-8", pdfAbsPath, "-"];
  const { stdout } = await execFileAsync(pdftotext, args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
  });
  return (stdout || "").toString();
}

/** ======== 3) 主处理逻辑 ======== */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id"); // 形如 /uploads/xxx.pdf
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // 只允许 public/uploads 下的文件
    const safeRel = ensureUploadsRelative(id.replace(/^\/+/, "")); // 去掉开头的斜杠
    const absPath = path.join(process.cwd(), "public", safeRel);

    // 存在性校验
    try {
      await fs.access(absPath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = extnameLower(absPath);

    // ============ A) 图片：直接 Tesseract ============
    if (
      [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"].includes(ext)
    ) {
      const text = await runTesseract(absPath, "eng"); // 如需中文可换成 "chi_sim+eng"
      return NextResponse.json({ ok: true, type: "image", text });
    }

    // ============ B) Word：用 mammoth 读取 ============
    if (ext === ".docx") {
      try {
        // 👇 为了兼容类型提示，强转为 any
        const mammoth: any = await import("mammoth");
        const buf = await fs.readFile(absPath);
        // 保留你原来写法：convertToMarkdown
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
      // .doc 老格式建议提示转成 docx 再读；也可集成 libreoffice 做转换
      return NextResponse.json(
        { error: ".doc is not supported. Please convert to .docx." },
        { status: 415 }
      );
    }

    // ============ C) PDF：渲染为图片 → OCR ============
    if (ext === ".pdf") {
      try {
        // 1) PDF → PNG（需要安装 Poppler 的 pdftoppm）
        const pages = await pdfToPngs(absPath, 300);

        // 2) 逐页 OCR（串行最稳；如需提速可 Promise.all 限流）
        let total = "";
        for (let i = 0; i < pages.length; i++) {
          const pagePath = pages[i];
          const pageText = await runTesseract(pagePath, "eng"); // 需要中文可改 "chi_sim+eng"
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
        // 兜底：尝试 pdfjs 直接抽文本（某些扫描件没有文本就会空）
        try {
          const direct = await extractPdfTextByPoppler(absPath);
          if (direct.trim()) {
            return NextResponse.json({
              ok: true,
              type: "pdf-text",
              text: direct,
              note: "pdftoppm not available or OCR failed; returned direct text via pdfjs.",
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

    // 其它类型：直接返回不支持
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
