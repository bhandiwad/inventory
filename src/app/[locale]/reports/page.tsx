"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, Download, FileSpreadsheet, FileText, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { ClientTime } from "@/components/ClientTime";
import { Shell } from "@/components/Shell";
import { exportCurrentStockTemplate, parseAdjustmentFile } from "@/lib/excel";
import { friendlyError } from "@/lib/errors";
import { useLocalStore } from "@/lib/localStore";
import { buildMovementReport, daysAgo, exportMovementReportExcel, localDateKey, monthKey, normalizeServerReport, type BreakdownRow } from "@/lib/reports";
import { createClient } from "@/lib/supabase";
import type { ProductCard } from "@/lib/types";

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

export default function Reports({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const { addTransaction, backendMode, currentRole, products, tenantId, transactions } = useLocalStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fromDate, setFromDate] = useState(daysAgo(6));
  const [toDate, setToDate] = useState(localDateKey(new Date()));
  const [reportMonth, setReportMonth] = useState(monthKey(new Date()));
  const [serverReport, setServerReport] = useState<ReturnType<typeof buildMovementReport> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reportSource, setReportSource] = useState<"local" | "server">("local");
  const [busy, setBusy] = useState(false);

  const localReport = useMemo(() => buildMovementReport({ fromDate, products, reportMonth, toDate, transactions }), [fromDate, products, reportMonth, toDate, transactions]);
  const report = serverReport ?? localReport;
  const filteredTransactions = useMemo(() => transactions.filter((tx) => {
    const key = localDateKey(tx.occurred_at);
    return key >= fromDate && key <= toDate;
  }), [fromDate, toDate, transactions]);
  const lowStock = useMemo(() => products.filter(hasLowStock), [products]);
  const negativeStock = useMemo(() => products.filter(hasNegativeStock), [products]);
  const deadStock = useMemo(() => products
    .filter((product) => !product.last_movement_at && typeof product.on_hand === "number" && product.on_hand > 0)
    .slice(0, 8), [products]);
  const reorderSuggestions = useMemo(() => lowStock
    .map((product) => ({
      product,
      suggested: Math.max(1, (product.reorder_threshold ?? 0) * 2 - (product.on_hand ?? 0))
    }))
    .sort((first, second) => second.suggested - first.suggested)
    .slice(0, 8), [lowStock]);

  useEffect(() => {
    let cancelled = false;
    async function loadServerReport() {
      if (backendMode !== "supabase" || !tenantId) {
        setServerReport(null);
        setReportSource("local");
        return;
      }
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("get_inventory_movement_report", {
          target_tenant: tenantId,
          from_date: fromDate,
          to_date: toDate,
          report_month: reportMonth
        });
        if (error) throw error;
        if (!cancelled) {
          setServerReport(normalizeServerReport(data, localReport));
          setReportSource("server");
        }
      } catch {
        if (!cancelled) {
          setServerReport(null);
          setReportSource("local");
          setMessage("Using locally loaded transactions. Server report query is not available yet.");
        }
      }
    }
    loadServerReport();
    return () => {
      cancelled = true;
    };
  }, [backendMode, fromDate, localReport, reportMonth, tenantId, toDate]);

  function setPreset(days: number) {
    setFromDate(daysAgo(days - 1));
    setToDate(localDateKey(new Date()));
  }

  function maxMovement(rows: Array<{ added: number; sold: number }>) {
    return Math.max(1, ...rows.map((row) => row.added + row.sold));
  }

  return (
    <Shell locale={locale}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-zinc-600">Track what moved, what needs attention, and what to reorder.</p>
        </div>
        <span className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-soft">
          {reportSource === "server" ? "Server report" : "Loaded data report"}
        </span>
      </div>

      <section className="mb-4 rounded-md border bg-white p-3 shadow-soft">
        <div className="mb-3 flex items-center gap-2 font-bold">
          <CalendarDays size={18} /> Movement period
        </div>
        <div className="grid grid-cols-2 gap-2 lg:max-w-xl">
          <label className="grid gap-1 text-sm font-semibold">
            From
            <input className="tap-target rounded-md border px-3 font-normal" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            To
            <input className="tap-target rounded-md border px-3 font-normal" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 lg:max-w-xl">
          {[7, 15, 30].map((days) => (
            <button key={days} className="tap-target rounded-md border bg-white px-3 text-sm font-semibold" onClick={() => setPreset(days)}>
              {days} days
            </button>
          ))}
        </div>
      </section>

      <section className="mb-5 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
        <Metric icon={<TrendingDown size={15} />} label="Sold / removed" value={report.summary.sold} tone="red" />
        <Metric icon={<TrendingUp size={15} />} label="Added" value={report.summary.added} tone="green" />
        <Metric label="Net movement" value={report.summary.net > 0 ? `+${report.summary.net}` : report.summary.net} tone={report.summary.net < 0 ? "red" : "green"} />
        <Metric label="Products moved" value={report.summary.products} />
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h2 className="mb-2 text-lg font-bold">Date-wise movement</h2>
          <div className="overflow-hidden rounded-md border bg-white shadow-soft">
            {report.daily.length ? report.daily.map((row) => (
              <article key={row.day} className="border-b p-3 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{row.day}</div>
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
        </div>

        <section className="rounded-md border bg-white p-3 shadow-soft">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Monthly report</h2>
              <p className="text-sm text-zinc-600">Purchase pressure and sales movement.</p>
            </div>
            <input className="tap-target rounded-md border px-3 text-sm" type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-mist p-3">Sold <b className="text-red-700">{report.month.sold}</b></div>
            <div className="rounded-md bg-mist p-3">Added <b className="text-leaf">{report.month.added}</b></div>
            <div className="rounded-md bg-mist p-3">Net <b>{report.month.net > 0 ? `+${report.month.net}` : report.month.net}</b></div>
            <div className="rounded-md bg-mist p-3">Products <b>{report.month.products}</b></div>
            <div className="rounded-md bg-mist p-3">Returns <b>{report.month.returns}</b></div>
            <div className="rounded-md bg-mist p-3">Damage <b>{report.month.damaged}</b></div>
          </div>
        </section>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-lg font-bold">Top moved products</h2>
        <div className="grid gap-2 lg:grid-cols-2">
          {report.products.slice(0, 8).map((row) => (
            <Link key={row.id} href={`/${locale}/products/${row.id}`} className="rounded-md border bg-white p-3 shadow-soft">
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
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-2">
        <MovementBreakdown title="By product type" rows={report.categories} max={maxMovement(report.categories)} />
        <MovementBreakdown title="By car brand" rows={report.brands} max={maxMovement(report.brands)} />
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-2">
        <InsightList title="Reorder suggestions" empty="No low-stock products with reorder levels." items={reorderSuggestions.map(({ product, suggested }) => ({
          id: product.tenant_product_id,
          href: `/${locale}/products/${product.tenant_product_id}`,
          meta: `${product.on_hand ?? "not set"} on hand · threshold ${product.reorder_threshold ?? 0}`,
          name: product.display_name,
          value: `Order ${suggested}`
        }))} />
        <InsightList title="Dead stock check" empty="No stocked products without movement." items={deadStock.map((product) => ({
          id: product.tenant_product_id,
          href: `/${locale}/products/${product.tenant_product_id}`,
          meta: `${product.brand_name} · ${product.category_name}`,
          name: product.display_name,
          value: `${product.on_hand} on hand`
        }))} />
      </section>

      <section className="mb-5 grid grid-cols-2 gap-2 text-sm">
        <Metric icon={<AlertTriangle size={15} />} label="Negative stock" value={negativeStock.length} tone="red" />
        <Metric label="Low stock" value={lowStock.length} tone="amber" />
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <button className="tap-target flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-4 py-3 font-semibold text-white" onClick={() => exportCurrentStockTemplate(products)}>
          <Download size={18} /> Current stock export
        </button>
        <button className="tap-target flex w-full items-center justify-center gap-2 rounded-md border bg-white px-4 py-3 font-semibold" onClick={() => exportMovementReportExcel(report)}>
          <FileSpreadsheet size={18} /> Movement report Excel
        </button>
        <button className="tap-target flex w-full items-center justify-center gap-2 rounded-md border bg-white px-4 py-3 font-semibold" onClick={() => window.print()}>
          <FileText size={18} /> Monthly PDF / print
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
              setMessage(friendlyError(error, "Import failed. Use the app-generated stock adjustment template."));
            } finally {
              setBusy(false);
              event.target.value = "";
            }
          }}
        />
        {message ? <div className="rounded-md bg-white p-3 text-sm shadow-soft md:col-span-4">{message}</div> : null}
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

function Metric({ icon, label, tone, value }: { icon?: ReactNode; label: string; tone?: "amber" | "green" | "red"; value: ReactNode }) {
  const toneClass = tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : tone === "green" ? "text-leaf" : "";
  return (
    <div className="rounded-md border bg-white p-3 shadow-soft">
      <div className="flex items-center gap-1 text-zinc-600">{icon}{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function MovementBreakdown({ max, rows, title }: { max: number; rows: BreakdownRow[]; title: string }) {
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

function InsightList({ empty, items, title }: { empty: string; items: Array<{ href: string; id: string; meta: string; name: string; value: string }>; title: string }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-2">
        {items.length ? items.map((item) => (
          <Link key={item.id} href={item.href} className="block rounded-md border bg-white p-3 shadow-soft">
            <div className="flex justify-between gap-3">
              <div>
                <div className="font-semibold">{item.name}</div>
                <div className="text-sm text-zinc-600">{item.meta}</div>
              </div>
              <div className="text-right text-sm font-bold text-leaf">{item.value}</div>
            </div>
          </Link>
        )) : <div className="rounded-md border bg-white p-3 text-sm text-zinc-600 shadow-soft">{empty}</div>}
      </div>
    </section>
  );
}
