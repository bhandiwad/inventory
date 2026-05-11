"use client";

import { useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useLocalStore } from "@/lib/localStore";
import { canQueueMutation } from "@/lib/permissions";
import type { ProductCard, TenantRole, TransactionType } from "@/lib/types";

export function StockAction({
  tenantId,
  role,
  product,
  type,
  actionLabel
}: {
  tenantId: string;
  role: TenantRole;
  product: ProductCard;
  type: TransactionType;
  actionLabel?: string;
}) {
  const { addTransaction, undoTransaction } = useLocalStore();
  const [qty, setQty] = useState(1);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const signedQty = type === "sale" || type === "damage" ? -Math.abs(qty) : Math.abs(qty);
  const willBeNegative = typeof product.on_hand === "number" && product.on_hand + signedQty < 0;
  const allowed = canQueueMutation(role, type);

  async function commit() {
    if (!allowed) {
      setMessage("Viewer access is read-only");
      return;
    }
    try {
      const transaction = await addTransaction({
        tenant_product_id: product.tenant_product_id,
        qty: signedQty,
        type,
        created_offline: !navigator.onLine
      });
      setLastTransactionId(transaction.id);
      setMessage(navigator.onLine ? "Stock updated" : "Saved offline");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update stock");
    }
  }

  async function undo() {
    if (!lastTransactionId) return;
    try {
      await undoTransaction(lastTransactionId);
      setLastTransactionId(null);
      setMessage("Undo saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not undo");
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-soft">
      <div className="font-semibold">{product.display_name}</div>
      <div className="text-sm text-zinc-600">{product.brand_name} · {product.category_name}</div>
      <div className="mt-2 text-sm">
        Current: <span className={typeof product.on_hand === "number" && product.on_hand < 0 ? "font-bold text-red-700" : "font-bold text-leaf"}>{product.on_hand ?? "stock not set"}</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button className="tap-target rounded-md border px-4" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity">
          <Minus size={18} />
        </button>
        <input className="w-20 rounded-md border px-3 py-2 text-center text-lg" value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} inputMode="numeric" />
        <button className="tap-target rounded-md border px-4" onClick={() => setQty(qty + 1)} aria-label="Increase quantity">
          <Plus size={18} />
        </button>
      </div>
      {willBeNegative ? <div className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">This will take stock below zero.</div> : null}
      <div className="mt-3 flex gap-2">
        <button className="tap-target flex-1 rounded-md bg-leaf px-4 py-2 font-semibold text-white disabled:bg-zinc-300" onClick={commit} disabled={!allowed}>
          Confirm {actionLabel ?? "transaction"}
        </button>
        {lastTransactionId ? (
          <button className="tap-target rounded-md border px-3" onClick={undo} aria-label="Undo transaction">
            <RotateCcw size={18} />
          </button>
        ) : null}
      </div>
      {message ? <div className="mt-2 text-sm text-zinc-700">{message}</div> : null}
    </div>
  );
}
