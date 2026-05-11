import { describe, expect, it } from "vitest";
import { findVoiceCandidates, parseVoiceIntent, voiceProductQuery } from "../../src/lib/voice";
import { seedProducts } from "../../src/lib/seedProducts";

describe("voice interpretation", () => {
  it("extracts stock-out quantity and sale intent", () => {
    const intent = parseVoiceIntent("sell two Brezza LLM");
    expect(intent.type).toBe("sale");
    expect(intent.qty).toBe(2);
  });

  it("returns curated alias candidates without auto-committing", () => {
    const candidates = findVoiceCandidates(seedProducts, "Breeza LLM two", 2);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].product.display_name).toContain("BREZZA");
  });

  it("also supports typed chat commands", () => {
    const intent = parseVoiceIntent("stock in 3 Swift mat");
    const candidates = findVoiceCandidates(seedProducts, intent.transcript, 2);
    expect(intent.type).toBe("purchase");
    expect(intent.qty).toBe(3);
    expect(candidates[0].product.display_name).toContain("SWIFT");
  });

  it("removes command words before server-side candidate search", () => {
    expect(voiceProductQuery("stock out two Breeza LLM pieces")).toBe("breeza llm");
  });
});
