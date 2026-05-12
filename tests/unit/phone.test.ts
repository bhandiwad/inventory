import { describe, expect, it } from "vitest";
import { isLikelyE164Phone, normalizeIndianPhone } from "../../src/lib/phone";

describe("phone normalization", () => {
  it("normalizes common Indian phone input to E.164", () => {
    expect(normalizeIndianPhone("98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("09876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("91 98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("+919876543210");
  });

  it("validates E.164 shape", () => {
    expect(isLikelyE164Phone("+919876543210")).toBe(true);
    expect(isLikelyE164Phone("9876543210")).toBe(false);
  });
});
