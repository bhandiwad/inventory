"use client";

import Link from "next/link";
import { use, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, PackageCheck, TrendingDown, TrendingUp } from "lucide-react";
import { ClientTime } from "@/components/ClientTime";
import { Shell } from "@/components/Shell";
import { useLocalStore } from "@/lib/localStore";
import { daysAgo, localDateKey, movementSummary } from "@/lib/reports";

export default function ProductMovement({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = use(params);
  const { products, transactions } = useLocalStore();
  const [fromDate, setFromDate] = useState(daysAgo(29));
  const [toDate, setToDate] = useState(localDateKey(new Date()));
  const product = products.find((item) => item.tenant_product_id === id);
  const productTransactions = useMemo(() => transactions.filter((tx) => {
    const key = localDateKey(tx.occurred_at);
    return tx.tenant_product_id === id && key >= fromDate && key <= toDate;
  }), [fromDate, id, toDate, transactions]);
  const summary = useMemo(() => movementSummary(productTransactions), [productTransactions]);
  const daysSinceMovement = product?.last_movement_at ? Math.max(0, Math.floor((Date.now() - new Date(product.last_movement_at).getTime()) / 86400000)) : null;
  const suggestedOrder = product && typeof product.reorder_threshold === "number" && typeof product.on_hand === "number" && product.reorder_threshold > 0 && product.on_hand <= product.reorder_threshold
    ? Math.max(1, product.reorder_threshold * 2 - product.on_hand)
    : 0;

  return (
    <Shell locale={locale}>
      <Link href={`/${locale}/products`} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-leaf">
        <ArrowLeft size={16} /> Products
      </Link>
      {!product ? (
        <section className="rounded-md border bg-white p-4 shadow-soft">
          <h1 className="text-xl font-bold">Product not found</h1>
          <p className="mt-1 text-sm text-zinc-600">This product may have been archived or is not available for this shop.</p>
        </section>
      ) : (
        <>
          <header className="mb-4 rounded-md border bg-white p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase text-leaf">{product.brand_name} · {product.category_name}</p>
                <h1 className="mt-1 text-2xl font-bold">{product.display_name}</h1>
                {product.variant ? <p className="mt-1 text-sm text-zinc-600">Variant: {product.variant}</p> : null}
              </div>
              <div className="rounded-md bg-mist px-4 py-3 text-right">
                <div className={typeof product.on_hand === "number" && product.on_hand < 0 ? "text-2xl font-bold text-red-700" : "text-2xl font-bold text-leaf"}>
                  {product.on_hand ?? "not set"}
                </div>
                <div className="text-xs text-zinc-600">on hand</div>
              </div>
            </div>
          </header>

          <section className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric icon={<TrendingDown size={15} />} label="Sold / removed" value={summary.sold} tone="red" />
            <Metric icon={<TrendingUp size={15} />} label="Added" value={summary.added} tone="green" />
            <Metric label="Net" value={summary.net > 0 ? `+${summary.net}` : summary.net} tone={summary.net < 0 ? "red" : "green"} />
            <Metric icon={<PackageCheck size={15} />} label="Movements" value={summary.count} />
          </section>

          <section className="mb-4 rounded-md border bg-white p-3 shadow-soft">
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
          </section>

          <section className="mb-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border bg-white p-3 shadow-soft">
              <div className="text-sm text-zinc-600">Last movement</div>
              <div className="mt-1 font-bold">{product.last_movement_at ? <ClientTime value={product.last_movement_at} dateTime /> : "No movement yet"}</div>
              {daysSinceMovement != null ? <div className="mt-1 text-sm text-zinc-600">{daysSinceMovement} days ago</div> : null}
            </div>
            <div className="rounded-md border bg-white p-3 shadow-soft">
              <div className="text-sm text-zinc-600">Reorder level</div>
              <div className="mt-1 font-bold">{product.reorder_threshold ?? 0}</div>
            </div>
            <div className="rounded-md border bg-white p-3 shadow-soft">
              <div className="text-sm text-zinc-600">Suggested action</div>
              <div className="mt-1 font-bold">{suggestedOrder > 0 ? `Order ${suggestedOrder}` : "No reorder needed"}</div>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold">Product movement</h2>
            <div className="space-y-2">
              {productTransactions.length ? productTransactions.map((tx) => (
                <article key={tx.id} className="rounded-md border bg-white p-3 text-sm shadow-soft">
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-semibold capitalize">{tx.type}</div>
                      <div className="mt-1 text-zinc-600">{tx.source} · {tx.user_name}</div>
                    </div>
                    <div className={tx.qty < 0 ? "text-right text-lg font-bold text-red-700" : "text-right text-lg font-bold text-leaf"}>{tx.qty > 0 ? `+${tx.qty}` : tx.qty}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500"><ClientTime value={tx.occurred_at} dateTime />{tx.reverses_transaction_id ? " · undo" : ""}{tx.created_offline ? " · offline" : ""}</div>
                  {tx.notes ? <div className="mt-2 rounded-md bg-mist p-2 text-zinc-700">{tx.notes}</div> : null}
                </article>
              )) : <div className="rounded-md border bg-white p-3 text-sm text-zinc-600 shadow-soft">No movement in this period.</div>}
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}

function Metric({ icon, label, tone, value }: { icon?: ReactNode; label: string; tone?: "green" | "red"; value: ReactNode }) {
  const toneClass = tone === "red" ? "text-red-700" : tone === "green" ? "text-leaf" : "";
  return (
    <div className="rounded-md border bg-white p-3 shadow-soft">
      <div className="flex items-center gap-1 text-sm text-zinc-600">{icon}{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
