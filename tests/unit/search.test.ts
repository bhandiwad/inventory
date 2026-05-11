import { describe, expect, it } from "vitest";
import { productMatches } from "../../src/lib/localStore";
import { seedProducts } from "../../src/lib/seedProducts";

describe("inventory search", () => {
  it("matches shopkeeper-style multi-token queries with implied words between", () => {
    const brezzaLlm = seedProducts.find((product) => product.display_name.includes("BREZZA 16"));
    expect(brezzaLlm).toBeTruthy();
    expect(productMatches(brezzaLlm!, "Brezza LLM")).toBe(true);
  });

  it("matches curated spelling aliases", () => {
    const brezzaLlm = seedProducts.find((product) => product.display_name.includes("BREZZA 16"));
    expect(productMatches(brezzaLlm!, "BREEZA LLM")).toBe(true);
  });
});
