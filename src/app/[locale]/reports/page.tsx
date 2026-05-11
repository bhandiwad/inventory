"use client";

import { use, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { ClientTime } from "@/components/ClientTime";
import { Shell } from "@/components/Shell";
import { exportCurrentStockTemplate, parseAdjustmentFile } from "@/lib/excel";
import { useLocalStore } from "@/lib/localStore";
import type { ProductCard } from "@/lib/types";

function hasLowStock(product: ProductCard) {
  return (
    typeof product.on_hand === "number" &&
    typeof product.reorder_threshold === "number" &&
    product.reorder_threshold > 0 &&
    product.on_hand <= product.reorder_threshold
  );
}

export default function Reports({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const { addTransaction, currentRole, products, transactions } = useLocalStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lowStock = products.filter(hasLowStock);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaysTransactions = transactions.filter((tx) => tx.occurred_at.slice(0, 10) === todayKey);

  return (
    <Shell locale={locale}>
      <h1 className="mb-3 text-2xl font-bold">Reports</h1>
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
      <section className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg border bg-white p-3 shadow-soft"><b>{todaysTransactions.length}</b><br />today</div>
        <div className="rounded-lg border bg-white p-3 shadow-soft"><b>{lowStock.length}</b><br />low</div>
        <div className="rounded-lg border bg-white p-3 shadow-soft"><b>{transactions.length}</b><br />moves</div>
      </section>
      <section className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Transaction log</h2>
        <div className="space-y-2">
          {transactions.map((tx) => (
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
      <section className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Low-stock list</h2>
        <div className="space-y-2">
          {lowStock.map((product) => (
            <article key={product.tenant_product_id} className="rounded-lg border bg-white p-3 shadow-soft">
              <div className="font-semibold">{product.display_name}</div>
              <div className="text-sm text-zinc-600">{product.on_hand} on hand · threshold {product.reorder_threshold}</div>
            </article>
          ))}
        </div>
      </section>
    </Shell>
  );
}
