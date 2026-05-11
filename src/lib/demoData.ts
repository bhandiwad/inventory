import type { InventoryTransaction, ProductCard, TenantUser } from "./types";
import { seedProducts } from "./seedProducts";

export const demoTenantId = "00000000-0000-4000-8000-000000000001";
export const demoBaseTime = "2026-05-10T04:30:00.000Z";

export const demoProducts: ProductCard[] = seedProducts;

export const demoUsers: TenantUser[] = [
  { id: "owner", name: "Owner", role: "owner", phone: "+91 90000 00001", is_active: true },
  { id: "staff", name: "Staff", role: "staff", phone: "+91 90000 00002", is_active: true },
  { id: "viewer", name: "Accountant", role: "viewer", phone: "+91 90000 00003", is_active: true }
];

export const demoTransactions: InventoryTransaction[] = [
  {
    id: "tx-seed-1",
    tenant_id: demoTenantId,
    tenant_product_id: demoProducts[1]?.tenant_product_id ?? "seed-product-1",
    product_name: demoProducts[1]?.display_name ?? "Seed product",
    qty: -1,
    type: "sale",
    source: "manual",
    user_name: "Owner",
    occurred_at: "2026-05-10T04:06:00.000Z",
    notes: "Counter sale"
  },
  {
    id: "tx-seed-2",
    tenant_id: demoTenantId,
    tenant_product_id: demoProducts[0]?.tenant_product_id ?? "seed-product-0",
    product_name: demoProducts[0]?.display_name ?? "Seed product",
    qty: 3,
    type: "purchase",
    source: "manual",
    user_name: "Staff",
    occurred_at: "2026-05-10T03:10:00.000Z"
  }
];
