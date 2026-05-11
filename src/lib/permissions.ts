import type { TenantRole, TransactionType } from "./types";

export function canWriteStock(role: TenantRole) {
  return role === "owner" || role === "staff";
}

export function canAdjustStock(role: TenantRole) {
  return role === "owner";
}

export function canManageTenant(role: TenantRole) {
  return role === "owner";
}

export function canQueueMutation(role: TenantRole, type: TransactionType) {
  if (type === "purchase" || type === "sale") return canWriteStock(role);
  return canAdjustStock(role);
}
