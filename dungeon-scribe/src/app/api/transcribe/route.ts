import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const form = await req.formData();

  //send the uploaded audio file to the Python HTTP service (port 5001)
  const upstream =
    process.env.TRANSCRIBE_HTTP || "http://localhost:5001/transcribe";
  const py = await fetch(upstream, {
    method: "POST",
    body: form as any,
  });

  if (!py.ok) {
    const t = await py.text().catch(() => "");
    return new NextResponse(t || "Upstream transcribe error", {
      status: py.status,
    });
  }

  const data = await py.json();
  return NextResponse.json(data);
}
