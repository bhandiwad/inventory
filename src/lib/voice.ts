import type { ProductCard, TransactionType, VoiceCandidate, VoiceIntent } from "./types";

export type TranscriptResult = {
  transcript: string;
  language?: string;
  latencyMs?: number;
  provider?: "sarvam" | "web-speech";
};

export interface TranscriptionProvider {
  transcribe(audio: Blob): Promise<TranscriptResult>;
}

const numberWords = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10]
]);

const commandWords = new Set([
  "stock",
  "out",
  "in",
  "sell",
  "sale",
  "sold",
  "purchase",
  "buy",
  "add",
  "return",
  "damage",
  "adjust",
  "adjustment",
  "piece",
  "pieces",
  "pcs",
  "pc",
  "quantity",
  "qty"
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseVoiceIntent(transcript: string, language?: string): VoiceIntent {
  const normalized = normalize(transcript);
  const terms = normalized.split(" ").filter(Boolean);
  const numberTerm = terms.find((term) => /^\d+$/.test(term) || numberWords.has(term));
  const qty = numberTerm ? (/^\d+$/.test(numberTerm) ? Number(numberTerm) : numberWords.get(numberTerm) ?? 1) : 1;
  let type: TransactionType = "sale";
  let action: VoiceIntent["action"] = "lookup";
  if (/\b(stock in|purchase|buy|add)\b/.test(normalized)) type = "purchase";
  if (/\b(stock out|sell|sale|sold)\b/.test(normalized)) type = "sale";
  if (/\breturn\b/.test(normalized)) type = "return";
  if (/\bdamage|damaged\b/.test(normalized)) type = "damage";
  if (/\badjust|adjustment\b/.test(normalized)) type = "adjustment";
  if (/\b(stock in|stock out|purchase|buy|add|sell|sale|sold|return|damage|damaged|adjust|adjustment)\b/.test(normalized)) action = "transaction";
  return { transcript, qty: Math.max(1, qty), type, action, language };
}

function scoreProduct(product: ProductCard, transcript: string) {
  const queryTerms = voiceProductTerms(transcript);
  const haystack = normalize([
    product.display_name,
    product.shop_label,
    product.tenant_notes,
    product.brand_name,
    product.category_name,
    product.variant,
    ...(product.aliases ?? [])
  ].filter(Boolean).join(" "));
  if (!queryTerms.length) return 0;
  let score = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) score += term.length >= 4 ? 3 : 1;
  }
  if (normalize(product.display_name).includes(queryTerms.join(" "))) score += 5;
  return score;
}

export function voiceProductTerms(transcript: string) {
  return normalize(transcript)
    .split(" ")
    .filter((term) => term && !commandWords.has(term) && !/^\d+$/.test(term) && !numberWords.has(term));
}

export function voiceProductQuery(transcript: string) {
  return voiceProductTerms(transcript).join(" ");
}

export function findVoiceCandidates(products: ProductCard[], transcript: string, limit = 2): VoiceCandidate[] {
  return products
    .map((product) => ({ product, score: scoreProduct(product, transcript) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.product.display_name.localeCompare(b.product.display_name))
    .slice(0, limit);
}

export async function transcribeWithSarvam(audio: Blob): Promise<TranscriptResult> {
  const formData = new FormData();
  const extension = audio.type.includes("mp4") ? "m4a" : audio.type.includes("mpeg") ? "mp3" : audio.type.includes("wav") ? "wav" : "webm";
  formData.append("file", audio, `voice-${Date.now()}.${extension}`);
  formData.append("mime_type", audio.type || "unknown");
  const response = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: formData
  });
  const data = await response.json();
  if (!response.ok) {
    const detail = typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : JSON.stringify(data.error ?? data);
    throw new Error(detail || "Voice transcription failed");
  }
  return data as TranscriptResult;
}
