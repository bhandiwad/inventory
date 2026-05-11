import { describe, expect, it } from "vitest";
import { canAdjustStock, canManageTenant, canQueueMutation, canWriteStock } from "../../src/lib/permissions";

describe("tenant role permissions", () => {
  it("allows owner and staff to write purchase and sale", () => {
    expect(canWriteStock("owner")).toBe(true);
    expect(canWriteStock("staff")).toBe(true);
    expect(canQueueMutation("staff", "sale")).toBe(true);
  });

  it("blocks viewer writes and offline queue", () => {
    expect(canWriteStock("viewer")).toBe(false);
    expect(canQueueMutation("viewer", "sale")).toBe(false);
  });

  it("restricts adjustments and management to owner", () => {
    expect(canAdjustStock("owner")).toBe(true);
    expect(canAdjustStock("staff")).toBe(false);
    expect(canManageTenant("owner")).toBe(true);
    expect(canManageTenant("staff")).toBe(false);
  });
});
