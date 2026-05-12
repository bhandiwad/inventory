"use client";

import { use, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Download, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { ClientTime } from "@/components/ClientTime";
import { Shell } from "@/components/Shell";
import { exportCurrentStockTemplate, parseAdjustmentFile } from "@/lib/excel";
import { useLocalStore } from "@/lib/localStore";
import type { InventoryTransaction, ProductCard } from "@/lib/types";

function hasLowStock(product: ProductCard) {
  return (
    typeof product.on_hand === "number" &&
    typeof product.reorder_threshold === "number" &&
    product.reorder_threshold > 0 &&
    product.on_hand <= product.reorder_threshold
  );
}

function hasNegativeStock(product: ProductCard) {
  return typeof product.on_hand === "number" && product.on_hand < 0;
}

function localDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}

function movementParts(transactions: InventoryTransaction[]) {
  return transactions.reduce((summary, tx) => {
    if (tx.qty < 0) summary.sold += Math.abs(tx.qty);
    if (tx.qty > 0) summary.added += tx.qty;
    if (tx.type === "damage") summary.damaged += Math.abs(tx.qty);
    if (tx.type === "return") summary.returns += Math.abs(tx.qty);
    if (tx.type === "adjustment") summary.adjustments += Math.abs(tx.qty);
    summary.net += tx.qty;
    summary.count += 1;
    summary.products.add(tx.tenant_product_id);
    return summary;
  }, { added: 0, adjustments: 0, count: 0, damaged: 0, net: 0, products: new Set<string>(), returns: 0, sold: 0 });
}

function productFor(products: ProductCard[], id: string) {
  return products.find((product) => product.tenant_product_id === id);
}

export default function Reports({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const { addTransaction, currentRole, products, transactions } = useLocalStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fromDate, setFromDate] = useState(daysAgo(6));
  const [toDate, setToDate] = useState(localDateKey(new Date()));
  const [reportMonth, setReportMonth] = useState(monthKey(new Date()));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lowStock = useMemo(() => products.filter(hasLowStock), [products]);
  const negativeStock = useMemo(() => products.filter(hasNegativeStock), [products]);
  const filteredTransactions = useMemo(() => transactions.filter((tx) => {
    const key = localDateKey(tx.occurred_at);
    return key >= fromDate && key <= toDate;
  }), [fromDate, toDate, transactions]);
  const monthlyTransactions = useMemo(() => transactions.filter((tx) => monthKey(tx.occurred_at) === reportMonth), [reportMonth, transactions]);
  const timeframe = useMemo(() => movementParts(filteredTransactions), [filteredTransactions]);
  const month = useMemo(() => movementParts(monthlyTransactions), [monthlyTransactions]);

  const dailyRows = useMemo(() => {
    const rows = new Map<string, InventoryTransaction[]>();
    filteredTransactions.forEach((tx) => {
      const key = localDateKey(tx.occurred_at);
      rows.set(key, [...(rows.get(key) ?? []), tx]);
    });
    return Array.from(rows.entries())
      .map(([date, items]) => ({ date, ...movementParts(items) }))
      .sort((first, second) => second.date.localeCompare(first.date));
  }, [filteredTransactions]);

  const productRows = useMemo(() => {
    const rows = new Map<string, InventoryTransaction[]>();
    filteredTransactions.forEach((tx) => rows.set(tx.tenant_product_id, [...(rows.get(tx.tenant_product_id) ?? []), tx]));
    return Array.from(rows.entries())
      .map(([id, items]) => {
        const product = productFor(products, id);
        return { id, name: product?.display_name ?? items[0]?.product_name ?? "Product", brand: product?.brand_name, category: product?.category_name, ...movementParts(items) };
      })
      .sort((first, second) => second.sold + second.added - (first.sold + first.added))
      .slice(0, 8);
  }, [filteredTransactions, products]);

  const categoryRows = useMemo(() => {
    const rows = new Map<string, InventoryTransaction[]>();
    filteredTransactions.forEach((tx) => {
      const product = productFor(products, tx.tenant_product_id);
      const key = product?.category_name ?? "Uncategorized";
      rows.set(key, [...(rows.get(key) ?? []), tx]);
    });
    return Array.from(rows.entries())
      .map(([name, items]) => ({ name, ...movementParts(items) }))
      .sort((first, second) => second.sold + second.added - (first.sold + first.added))
      .slice(0, 6);
  }, [filteredTransactions, products]);

  const brandRows = useMemo(() => {
    const rows = new Map<string, InventoryTransaction[]>();
    filteredTransactions.forEach((tx) => {
      const product = productFor(products, tx.tenant_product_id);
      const key = product?.brand_name ?? "Unknown";
      rows.set(key, [...(rows.get(key) ?? []), tx]);
    });
    return Array.from(rows.entries())
      .map(([name, items]) => ({ name, ...movementParts(items) }))
      .sort((first, second) => second.sold + second.added - (first.sold + first.added))
      .slice(0, 6);
  }, [filteredTransactions, products]);

  function setPreset(days: number) {
    setFromDate(daysAgo(days - 1));
    setToDate(localDateKey(new Date()));
  }

  function maxMovement(rows: Array<{ added: number; sold: number }>) {
    return Math.max(1, ...rows.map((row) => row.added + row.sold));
  }

  return (
    <Shell locale={locale}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-zinc-600">Track what moved, what needs attention, and what to reorder.</p>
      </div>

      <section className="mb-4 rounded-md border bg-white p-3 shadow-soft">
        <div className="mb-3 flex items-center gap-2 font-bold">
          <CalendarDays size={18} /> Movement period
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-sm font-semibold">
            From
            <input className="tap-target rounded-md border px-3 font-normal" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            To
            <input className="tap-target rounded-md border px-3 font-normal" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[7, 15, 30].map((days) => (
            <button key={days} className="tap-target rounded-md border bg-white px-3 text-sm font-semibold" onClick={() => setPreset(days)}>
              {days} days
            </button>
          ))}
        </div>
      </section>

      <section className="mb-5 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="flex items-center gap-1 text-zinc-600"><TrendingDown size={15} /> Sold / removed</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{timeframe.sold}</div>
        </div>
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="flex items-center gap-1 text-zinc-600"><TrendingUp size={15} /> Added</div>
          <div className="mt-1 text-2xl font-bold text-leaf">{timeframe.added}</div>
        </div>
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="text-zinc-600">Net movement</div>
          <div className={timeframe.net < 0 ? "mt-1 text-2xl font-bold text-red-700" : "mt-1 text-2xl font-bold text-leaf"}>{timeframe.net > 0 ? `+${timeframe.net}` : timeframe.net}</div>
        </div>
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="text-zinc-600">Products moved</div>
          <div className="mt-1 text-2xl font-bold">{timeframe.products.size}</div>
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-lg font-bold">Date-wise movement</h2>
        <div className="overflow-hidden rounded-md border bg-white shadow-soft">
          {dailyRows.length ? dailyRows.map((row) => (
            <article key={row.date} className="border-b p-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">{row.date}</div>
                <div className={row.net < 0 ? "font-bold text-red-700" : "font-bold text-leaf"}>{row.net > 0 ? `+${row.net}` : row.net}</div>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-sm text-zinc-600">
                <span>Sold {row.sold}</span>
                <span>Added {row.added}</span>
                <span>{row.count} moves</span>
              </div>
            </article>
          )) : <div className="p-3 text-sm text-zinc-600">No movement in this period.</div>}
        </div>
      </section>

      <section className="mb-5 rounded-md border bg-white p-3 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Monthly report</h2>
            <p className="text-sm text-zinc-600">Useful for checking purchase pressure and sales movement.</p>
          </div>
          <input className="tap-target rounded-md border px-3 text-sm" type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-mist p-3">Sold <b className="text-red-700">{month.sold}</b></div>
          <div className="rounded-md bg-mist p-3">Added <b className="text-leaf">{month.added}</b></div>
          <div className="rounded-md bg-mist p-3">Net <b>{month.net > 0 ? `+${month.net}` : month.net}</b></div>
          <div className="rounded-md bg-mist p-3">Products <b>{month.products.size}</b></div>
          <div className="rounded-md bg-mist p-3">Returns <b>{month.returns}</b></div>
          <div className="rounded-md bg-mist p-3">Damage <b>{month.damaged}</b></div>
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-lg font-bold">Top moved products</h2>
        <div className="space-y-2">
          {productRows.map((row) => (
            <article key={row.id} className="rounded-md border bg-white p-3 shadow-soft">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="font-semibold">{row.name}</div>
                  <div className="text-sm text-zinc-600">{row.brand} · {row.category}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-bold text-red-700">-{row.sold}</div>
                  <div className="font-bold text-leaf">+{row.added}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-2">
        <MovementBreakdown title="By product type" rows={categoryRows} max={maxMovement(categoryRows)} />
        <MovementBreakdown title="By car brand" rows={brandRows} max={maxMovement(brandRows)} />
      </section>

      <section className="mb-5 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="flex items-center gap-1 text-zinc-600"><AlertTriangle size={15} /> Negative stock</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{negativeStock.length}</div>
        </div>
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="text-zinc-600">Low stock</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{lowStock.length}</div>
        </div>
      </section>

      <section className="space-y-3">
        <button className="tap-target flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-4 py-3 font-semibold text-white" onClick={() => exportCurrentStockTemplate(products)}>
          <Download size={18} /> Current stock export
        </button>
        <button className="tap-target flex w-full items-center justify-center gap-2 rounded-md border bg-white px-4 py-3 font-semibold disabled:bg-zinc-200" onClick={() => inputRef.current?.click()} disabled={currentRole !== "owner" || busy}>
          <Upload size={18} /> {busy ? "Importing..." : "Stock adjustment import"}
        </button>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".xlsx"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const changes = await parseAdjustmentFile(file);
              await Promise.all(changes.map((change) => (
                addTransaction({ tenant_product_id: change.tenant_product_id, qty: change.delta, type: "adjustment", notes: "Excel adjustment import" })
              )));
              setMessage(`${changes.length} adjustment transactions created`);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Import failed");
            } finally {
              setBusy(false);
              event.target.value = "";
            }
          }}
        />
        {message ? <div className="rounded-md bg-white p-3 text-sm shadow-soft">{message}</div> : null}
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Movement log</h2>
        <div className="space-y-2">
          {filteredTransactions.slice(0, 50).map((tx) => (
            <article key={tx.id} className="rounded-lg border bg-white p-3 text-sm shadow-soft">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{tx.product_name}</span>
                <span className={tx.qty < 0 ? "font-bold text-red-700" : "font-bold text-leaf"}>{tx.qty > 0 ? `+${tx.qty}` : tx.qty}</span>
              </div>
              <div className="mt-1 text-zinc-600">{tx.type} · {tx.source} · {tx.user_name}</div>
              <div className="mt-1 text-xs text-zinc-500"><ClientTime value={tx.occurred_at} dateTime />{tx.reverses_transaction_id ? " · undo" : ""}{tx.created_offline ? " · offline" : ""}</div>
            </article>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function MovementBreakdown({ max, rows, title }: { max: number; rows: Array<{ added: number; name: string; sold: number }> ; title: string }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-2">
        {rows.length ? rows.map((row) => {
          const width = `${Math.max(8, ((row.added + row.sold) / max) * 100)}%`;
          return (
            <article key={row.name} className="rounded-md border bg-white p-3 shadow-soft">
              <div className="mb-2 flex justify-between gap-3 text-sm">
                <span className="font-semibold">{row.name}</span>
                <span className="text-zinc-600">-{row.sold} / +{row.added}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-leaf" style={{ width }} />
              </div>
            </article>
          );
        }) : <div className="rounded-md border bg-white p-3 text-sm text-zinc-600 shadow-soft">No movement in this period.</div>}
      </div>
    </section>
  );
}
