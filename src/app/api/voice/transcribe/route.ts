import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Sarvam API key is not configured." }, { status: 503 });
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }

  const started = Date.now();
  const formData = new FormData();
  const extension = file.type.includes("mp4") ? "mp4" : file.type.includes("aac") ? "aac" : "webm";
  formData.append("file", file, `voice.${extension}`);
  formData.append("model", "saaras:v3");
  formData.append("mode", "transcribe");
  formData.append("language_code", "unknown");

  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey
    },
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({ error: data?.message ?? data?.error ?? "Sarvam transcription failed." }, { status: response.status });
  }

  return NextResponse.json({
    transcript: data.transcript ?? "",
    language: data.language_code ?? undefined,
    latencyMs: Date.now() - started,
    provider: "sarvam"
  });
}
