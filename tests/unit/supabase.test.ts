import { describe, expect, it } from "vitest";
import { isSupabaseConfigured } from "../../src/lib/supabase";

describe("supabase config", () => {
  it("does not treat an empty env as configured", () => {
    expect(isSupabaseConfigured()).toBe(false);
  });
});
