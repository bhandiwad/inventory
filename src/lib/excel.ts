"use client";

import * as XLSX from "xlsx";
import type { ProductCard } from "./types";

const TEMPLATE_MARKER = "SMTC_STOCK_ADJUSTMENT_TEMPLATE_V1";

export function exportCurrentStockTemplate(products: ProductCard[]) {
  const rows = products.map((p) => ({
    template_marker: TEMPLATE_MARKER,
    tenant_product_id: p.tenant_product_id,
    product_name: p.display_name,
    current_quantity: p.on_hand ?? "",
    new_quantity: ""
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock Adjustment");
  XLSX.writeFile(wb, `stock-adjustment-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseAdjustmentFile(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets["Stock Adjustment"];
  if (!sheet) throw new Error("missing_stock_adjustment_sheet");
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);
  if (!rows.every((row) => row.template_marker === TEMPLATE_MARKER)) {
    throw new Error("not_app_generated_template");
  }
  return rows
    .map((row) => ({
      tenant_product_id: String(row.tenant_product_id),
      current_quantity: Number(row.current_quantity),
      new_quantity: row.new_quantity === "" || row.new_quantity == null ? null : Number(row.new_quantity)
    }))
    .filter((row) => row.new_quantity != null && row.new_quantity !== row.current_quantity)
    .map((row) => ({
      tenant_product_id: row.tenant_product_id,
      delta: Number(row.new_quantity) - row.current_quantity
    }));
}
