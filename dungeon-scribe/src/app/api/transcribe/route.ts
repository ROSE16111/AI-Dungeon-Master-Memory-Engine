import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function POST(req: Request) {
  const form = await req.formData();

  //send the uploaded audio file to the Python HTTP service (port 5001)
  const upstream =
    process.env.TRANSCRIBE_HTTP || "http://localhost:8001/transcribe";
  const py = await fetch(upstream, {
    method: "POST",
    body: form as any,
  });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: msg || "Transcribe failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Transcribe request failed" },
      { status: 500 }
    );
  }
}
