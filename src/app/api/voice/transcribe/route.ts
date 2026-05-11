import { NextResponse } from "next/server";

function sarvamCodecFor(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "x-m4a";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("webm")) return "webm";
  return null;
}

function fileExtensionFor(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("webm")) return "webm";
  return "webm";
}

function readableSarvamError(data: any) {
  if (!data) return "Sarvam transcription failed.";
  if (typeof data === "string") return data;
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item: any) => item?.msg ?? item?.message ?? JSON.stringify(item))
      .filter(Boolean)
      .join("; ");
  }
  return JSON.stringify(data);
}

export async function POST(request: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Sarvam API key is not configured." }, { status: 503 });
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  const browserMimeType = incoming.get("mime_type");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }
  if (file.size < 512) {
    return NextResponse.json({ error: "Recorded audio was too short. Tap the mic, speak, then tap again." }, { status: 400 });
  }

  const started = Date.now();
  const formData = new FormData();
  const detectedType = [file.type, typeof browserMimeType === "string" ? browserMimeType : ""].filter(Boolean).join(" ");
  const extension = fileExtensionFor(detectedType);
  const codec = sarvamCodecFor(detectedType);
  formData.append("file", file, `voice.${extension}`);
  formData.append("model", "saaras:v3");
  formData.append("mode", "transcribe");
  formData.append("language_code", "unknown");
  if (codec) formData.append("input_audio_codec", codec);

  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey
    },
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Sarvam transcription failed", {
      status: response.status,
      audioType: file.type,
      browserMimeType,
      audioSize: file.size,
      codec,
      error: data
    });
    return NextResponse.json({ error: readableSarvamError(data) }, { status: response.status });
  }

  return NextResponse.json({
    transcript: data.transcript ?? "",
    language: data.language_code ?? undefined,
    latencyMs: Date.now() - started,
    provider: "sarvam"
  });
}
