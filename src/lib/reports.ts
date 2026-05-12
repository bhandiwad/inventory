import * as XLSX from "xlsx";
import type { InventoryTransaction, ProductCard } from "./types";

export type MovementSummary = {
  added: number;
  adjustments: number;
  count: number;
  damaged: number;
  net: number;
  products: number;
  returns: number;
  sold: number;
};

export type DailyMovementRow = MovementSummary & { day: string };
export type ProductMovementRow = MovementSummary & { brand?: string | null; category?: string | null; id: string; name: string; movement: number };
export type BreakdownRow = { added: number; movement: number; name: string; sold: number };

export type MovementReport = {
  brands: BreakdownRow[];
  categories: BreakdownRow[];
  daily: DailyMovementRow[];
  fromDate: string;
  month: MovementSummary;
  products: ProductMovementRow[];
  reportMonth: string;
  summary: MovementSummary;
  toDate: string;
};

const emptySummary: MovementSummary = {
  added: 0,
  adjustments: 0,
  count: 0,
  damaged: 0,
  net: 0,
  products: 0,
  returns: 0,
  sold: 0
};

export function localDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}

function productFor(products: ProductCard[], id: string) {
  return products.find((product) => product.tenant_product_id === id);
}

export function movementSummary(transactions: InventoryTransaction[]): MovementSummary {
  const products = new Set<string>();
  const summary = transactions.reduce((current, tx) => {
    if (tx.qty < 0) current.sold += Math.abs(tx.qty);
    if (tx.qty > 0) current.added += tx.qty;
    if (tx.type === "damage") current.damaged += Math.abs(tx.qty);
    if (tx.type === "return") current.returns += Math.abs(tx.qty);
    if (tx.type === "adjustment") current.adjustments += Math.abs(tx.qty);
    current.net += tx.qty;
    current.count += 1;
    products.add(tx.tenant_product_id);
    return current;
  }, { ...emptySummary });
  summary.products = products.size;
  return summary;
}

export function buildMovementReport({
  fromDate,
  products,
  reportMonth,
  toDate,
  transactions
}: {
  fromDate: string;
  products: ProductCard[];
  reportMonth: string;
  toDate: string;
  transactions: InventoryTransaction[];
}): MovementReport {
  const scoped = transactions.filter((tx) => {
    const key = localDateKey(tx.occurred_at);
    return key >= fromDate && key <= toDate;
  });
  const monthly = transactions.filter((tx) => monthKey(tx.occurred_at) === reportMonth);

  const dailyRows = new Map<string, InventoryTransaction[]>();
  scoped.forEach((tx) => {
    const key = localDateKey(tx.occurred_at);
    dailyRows.set(key, [...(dailyRows.get(key) ?? []), tx]);
  });

  const productRows = new Map<string, InventoryTransaction[]>();
  scoped.forEach((tx) => productRows.set(tx.tenant_product_id, [...(productRows.get(tx.tenant_product_id) ?? []), tx]));

  const categoryRows = new Map<string, InventoryTransaction[]>();
  const brandRows = new Map<string, InventoryTransaction[]>();
  scoped.forEach((tx) => {
    const product = productFor(products, tx.tenant_product_id);
    const category = product?.category_name ?? "Uncategorized";
    const brand = product?.brand_name ?? "Unknown";
    categoryRows.set(category, [...(categoryRows.get(category) ?? []), tx]);
    brandRows.set(brand, [...(brandRows.get(brand) ?? []), tx]);
  });

  return {
    brands: Array.from(brandRows.entries()).map(([name, items]) => {
      const summary = movementSummary(items);
      return { name, added: summary.added, sold: summary.sold, movement: summary.added + summary.sold };
    }).sort((a, b) => b.movement - a.movement).slice(0, 12),
    categories: Array.from(categoryRows.entries()).map(([name, items]) => {
      const summary = movementSummary(items);
      return { name, added: summary.added, sold: summary.sold, movement: summary.added + summary.sold };
    }).sort((a, b) => b.movement - a.movement).slice(0, 12),
    daily: Array.from(dailyRows.entries()).map(([day, items]) => ({ day, ...movementSummary(items) })).sort((a, b) => b.day.localeCompare(a.day)),
    fromDate,
    month: movementSummary(monthly),
    products: Array.from(productRows.entries()).map(([id, items]) => {
      const product = productFor(products, id);
      const summary = movementSummary(items);
      return {
        ...summary,
        brand: product?.brand_name,
        category: product?.category_name,
        id,
        movement: summary.sold + summary.added,
        name: product?.display_name ?? items[0]?.product_name ?? "Product"
      };
    }).sort((a, b) => b.movement - a.movement).slice(0, 20),
    reportMonth,
    summary: movementSummary(scoped),
    toDate
  };
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

export function normalizeServerReport(value: any, fallback: MovementReport): MovementReport {
  if (!value || typeof value !== "object") return fallback;
  const normalizeSummary = (summary: any): MovementSummary => ({
    added: numberValue(summary?.added),
    adjustments: numberValue(summary?.adjustments),
    count: numberValue(summary?.count),
    damaged: numberValue(summary?.damaged),
    net: numberValue(summary?.net),
    products: numberValue(summary?.products),
    returns: numberValue(summary?.returns),
    sold: numberValue(summary?.sold)
  });
  return {
    brands: Array.isArray(value.brands) ? value.brands.map((row: any) => ({ added: numberValue(row.added), movement: numberValue(row.movement), name: String(row.name ?? "Unknown"), sold: numberValue(row.sold) })) : fallback.brands,
    categories: Array.isArray(value.categories) ? value.categories.map((row: any) => ({ added: numberValue(row.added), movement: numberValue(row.movement), name: String(row.name ?? "Uncategorized"), sold: numberValue(row.sold) })) : fallback.categories,
    daily: Array.isArray(value.daily) ? value.daily.map((row: any) => ({ day: String(row.day), ...normalizeSummary(row) })) : fallback.daily,
    fromDate: String(value.fromDate ?? fallback.fromDate),
    month: normalizeSummary(value.month),
    products: Array.isArray(value.products) ? value.products.map((row: any) => {
      const added = numberValue(row.added);
      const sold = numberValue(row.sold);
      return {
        ...normalizeSummary(row),
        added,
        brand: row.brand,
        category: row.category,
        id: String(row.tenant_product_id ?? row.id),
        movement: numberValue(row.movement || added + sold),
        name: String(row.name ?? "Product"),
        sold
      };
    }) : fallback.products,
    reportMonth: String(value.reportMonth ?? fallback.reportMonth),
    summary: normalizeSummary(value.summary),
    toDate: String(value.toDate ?? fallback.toDate)
  };
}

export function exportMovementReportExcel(report: MovementReport) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([report.summary]), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.daily), "Daily Movement");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.products), "Products");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.categories), "Categories");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.brands), "Brands");
  XLSX.writeFile(wb, `movement-report-${report.fromDate}-to-${report.toDate}.xlsx`);
}
