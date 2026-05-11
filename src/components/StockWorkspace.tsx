"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgePlus, Minus, Plus, Search, X } from "lucide-react";
import { ClientTime } from "@/components/ClientTime";
import { ChatControl } from "@/components/ChatControl";
import { OfflineBadge } from "@/components/OfflineBadge";
import { productMatches, useLocalStore } from "@/lib/localStore";
import { canAdjustStock, canWriteStock } from "@/lib/permissions";
import { parseVoiceIntent, transcribeWithSarvam } from "@/lib/voice";
import type { CommandSource, ProductCard, TransactionType, VoiceCandidate, VoiceIntent } from "@/lib/types";
import { VoiceControl } from "@/components/VoiceControl";

type StockMode = TransactionType;

export function StockWorkspace({
  appName,
  locale,
  stockOutLabel,
  stockInLabel,
  searchPlaceholder
}: {
  appName: string;
  locale: string;
  stockOutLabel: string;
  stockInLabel: string;
  searchPlaceholder: string;
}) {
  const { addCustomProduct, addTransaction, backendMode, confirmVoiceLog, createVoiceLog, currentRole, products, searchVoiceCandidates, setCurrentRole, statusMessage, transactions, undoTransaction } = useLocalStore();
  const [mode, setMode] = useState<StockMode>("sale");
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBrand, setCustomBrand] = useState("Universal / Generic");
  const [customCategory, setCustomCategory] = useState("LLM");
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<ProductCard | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceIntent, setVoiceIntent] = useState<VoiceIntent | null>(null);
  const [voiceCandidates, setVoiceCandidates] = useState<VoiceCandidate[]>([]);
  const [voiceLogId, setVoiceLogId] = useState<string | null>(null);
  const [commandSource, setCommandSource] = useState<CommandSource>("voice");
  const isStockOut = mode === "sale";
  const brands = Array.from(new Set(products.map((product) => product.brand_name).filter(Boolean) as string[]));
  const featuredBrands = ["Maruti", "Hyundai", "Tata", "Mahindra", "Toyota", "Kia", "Nexa", "Universal / Generic"].filter((brand) => brands.includes(brand));
  const categories = Array.from(new Set(products.filter((product) => selectedBrand === "All" || product.brand_name === selectedBrand).map((product) => product.category_name).filter(Boolean) as string[])).slice(0, 8);
  const matchingProducts = products.filter((product) => {
    if (selectedBrand !== "All" && product.brand_name !== selectedBrand) return false;
    if (selectedCategory !== "All" && product.category_name !== selectedCategory) return false;
    return productMatches(product, query);
  });
  const visibleProducts = matchingProducts.slice(0, 16);
  const roleCanUseMode = mode === "purchase" || mode === "sale" ? canWriteStock(currentRole) : canAdjustStock(currentRole);
  const actionLabel = mode === "sale" ? stockOutLabel : mode === "purchase" ? stockInLabel : mode[0].toUpperCase() + mode.slice(1);
  const signedQty = mode === "sale" || mode === "damage" ? -Math.abs(qty) : Math.abs(qty);
  const willBeNegative = selectedProduct && typeof selectedProduct.on_hand === "number" && selectedProduct.on_hand + signedQty < 0;

  async function createCustom() {
    if (!customName.trim()) return;
    setBusy(true);
    try {
      const product = await addCustomProduct({ name: customName.trim(), brand: customBrand, category: customCategory });
      setQuery(product.display_name);
      setSelectedProduct(product);
      setCustomName("");
      setCustomOpen(false);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not create product");
    } finally {
      setBusy(false);
    }
  }

  function selectMode(nextMode: StockMode) {
    setMode(nextMode);
    setQty(1);
    setToast("");
  }

  async function commitProduct(product: ProductCard, quantity: number, transactionType: TransactionType, source: "manual" | CommandSource = "manual", logId?: string | null) {
    const signedQuantity = transactionType === "sale" || transactionType === "damage" ? -Math.abs(quantity) : Math.abs(quantity);
    const allowed = transactionType === "purchase" || transactionType === "sale" ? canWriteStock(currentRole) : canAdjustStock(currentRole);
    if (!allowed) return;
    setBusy(true);
    try {
      const transaction = await addTransaction({
        tenant_product_id: product.tenant_product_id,
        qty: signedQuantity,
        type: transactionType,
        source,
        voice_log_id: logId ?? undefined,
        notes: note || undefined,
        created_offline: !navigator.onLine
      });
      if (source === "voice") await confirmVoiceLog(logId ?? null, product.tenant_product_id);
      setLastTransactionId(transaction.id);
      setToast(navigator.onLine ? "Stock updated" : "Saved offline");
      setSelectedProduct(null);
      setQty(1);
      setNote("");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not update stock");
    } finally {
      setBusy(false);
    }
  }

  async function commitSelectedProduct() {
    if (!selectedProduct || !roleCanUseMode) return;
    await commitProduct(selectedProduct, qty, mode);
  }

  async function handleCommandText(result: { transcript: string; language?: string; latencyMs?: number }, source: CommandSource) {
    const intent = parseVoiceIntent(result.transcript, result.language);
    const candidates = await searchVoiceCandidates(result.transcript, 2);
    setCommandSource(source);
    setVoiceIntent(intent);
    setVoiceCandidates(candidates);
    setMode(intent.type);
    setQty(intent.qty);
    if (candidates[0]) setQuery(candidates[0].product.display_name);
    const logId = source === "voice" ? await createVoiceLog({
        intent,
        candidateIds: candidates.map((candidate) => candidate.product.tenant_product_id),
        latencyMs: result.latencyMs
      }) : null;
    setVoiceLogId(logId);
    if (!candidates.length) {
      setToast("No matching product found");
    }
  }

  async function handleVoiceTranscript(result: { transcript: string; language?: string; latencyMs?: number }) {
    await handleCommandText(result, "voice");
  }

  async function handleChatMessage(message: string) {
    await handleCommandText({ transcript: message }, "chat");
  }

  async function confirmVoiceCandidate(candidate: VoiceCandidate) {
    if (!voiceIntent || !roleCanUseMode) return;
    await commitProduct(candidate.product, voiceIntent.qty, voiceIntent.type, commandSource, voiceLogId);
    setVoiceIntent(null);
    setVoiceCandidates([]);
    setVoiceLogId(null);
  }

  function updateVoiceQty(nextQty: number) {
    setVoiceIntent((current) => (current ? { ...current, qty: Math.max(1, nextQty) } : current));
  }

  async function undoLast() {
    if (!lastTransactionId) return;
    setBusy(true);
    try {
      await undoTransaction(lastTransactionId);
      setLastTransactionId(null);
      setToast("Undo saved");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not undo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-leaf">{appName}</p>
          <h1 className="text-2xl font-bold tracking-normal">{actionLabel}</h1>
        </div>
        <OfflineBadge />
      </header>
      {backendMode === "demo" && statusMessage ? (
        <section className="mb-3 rounded-md border border-leaf/20 bg-white p-3 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold">Demo mode</div>
              <p className="mt-1 text-sm text-zinc-600">Sign in to create or join a real shop.</p>
            </div>
            <Link href={`/${locale}/auth`} className="rounded-md bg-leaf px-3 py-2 text-sm font-semibold text-white">
              Sign in
            </Link>
          </div>
        </section>
      ) : null}
      {backendMode === "supabase" && !products.length && statusMessage ? (
        <section className="mb-3 rounded-md border border-leaf/20 bg-white p-3 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-700">{statusMessage}</p>
            <Link href={`/${locale}/onboarding`} className="rounded-md bg-leaf px-3 py-2 text-sm font-semibold text-white">
              Set up
            </Link>
          </div>
        </section>
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-soft">
        <span className="text-zinc-600">Working as</span>
        {backendMode === "demo" ? (
          <div className="flex gap-1">
          {(["owner", "staff", "viewer"] as const).map((role) => (
            <button
              key={role}
              className={`rounded px-2 py-1 text-xs font-semibold capitalize ${currentRole === role ? "bg-leaf text-white" : "bg-zinc-100 text-zinc-700"}`}
              onClick={() => setCurrentRole(role)}
            >
              {role}
            </button>
          ))}
          </div>
        ) : <span className="rounded bg-leaf px-2 py-1 text-xs font-semibold capitalize text-white">{currentRole}</span>}
      </div>
      <label className="mb-3 flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-soft">
        <Search size={18} />
        <input className="w-full bg-transparent outline-none" placeholder={searchPlaceholder} value={query} onChange={(event) => setQuery(event.target.value)} onInput={(event) => setQuery(event.currentTarget.value)} />
      </label>
      <section className="mb-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase text-zinc-500">Brands</h2>
          <button className="text-sm font-semibold text-leaf" onClick={() => { setSelectedBrand("Universal / Generic"); setSelectedCategory("All"); }}>Universal</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["All", ...featuredBrands].map((brand) => {
            const count = brand === "All" ? products.length : products.filter((product) => product.brand_name === brand).length;
            return (
              <button key={brand} className={`min-w-fit rounded-md border px-3 py-2 text-left ${selectedBrand === brand ? "border-leaf bg-leaf text-white" : "bg-white"}`} onClick={() => { setSelectedBrand(brand); setSelectedCategory("All"); }}>
                <div className="text-sm font-bold">{brand}</div>
                <div className={`text-xs ${selectedBrand === brand ? "text-white/80" : "text-zinc-500"}`}>{count} products</div>
              </button>
            );
          })}
        </div>
      </section>
      <section className="mb-3">
        <h2 className="mb-2 text-sm font-bold uppercase text-zinc-500">Product Type</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["All", ...categories].map((category) => (
            <button key={category} className={`min-w-fit rounded-full border px-3 py-2 text-sm font-semibold ${selectedCategory === category ? "border-ink bg-ink text-white" : "bg-white"}`} onClick={() => setSelectedCategory(category)}>
              {category}
            </button>
          ))}
        </div>
      </section>
      <div className="mb-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Stock action">
        <button
          className={`tap-target rounded-md px-3 py-2 font-semibold ${isStockOut ? "bg-ink text-white" : "border border-zinc-300 bg-white"}`}
          onClick={() => selectMode("sale")}
          role="tab"
          aria-selected={isStockOut}
        >
          {stockOutLabel}
        </button>
        <button
          className={`tap-target rounded-md px-3 py-2 font-semibold ${!isStockOut ? "bg-ink text-white" : "border border-zinc-300 bg-white"}`}
          onClick={() => selectMode("purchase")}
          role="tab"
          aria-selected={!isStockOut}
        >
          {stockInLabel}
        </button>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {(["adjustment", "return", "damage"] as const).map((item) => (
          <button
            key={item}
            className={`tap-target rounded-md px-2 py-2 text-sm font-semibold capitalize ${mode === item ? "bg-ink text-white" : "border border-zinc-300 bg-white"}`}
            onClick={() => selectMode(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {!roleCanUseMode ? <div className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">This role cannot record {actionLabel.toLowerCase()} transactions.</div> : null}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase text-zinc-500">Products</h2>
        <span className="text-sm text-zinc-600">{matchingProducts.length} found</span>
      </div>
      <div className="space-y-2">
        {visibleProducts.map((product) => (
          <button
            key={product.tenant_product_id}
            className="tap-target w-full rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-soft transition active:scale-[0.99]"
            onClick={() => {
              setSelectedProduct(product);
              setToast("");
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{product.display_name}</div>
                <div className="mt-1 text-sm text-zinc-600">{product.brand_name} · {product.category_name}</div>
              </div>
              <div className={typeof product.on_hand === "number" && product.on_hand < 0 ? "text-right font-bold text-red-700" : "text-right font-bold text-leaf"}>
                {product.on_hand ?? "not set"}
                <div className="text-xs font-normal text-zinc-500">on hand</div>
              </div>
            </div>
          </button>
        ))}
      </div>
      {visibleProducts.length === 0 || customOpen ? (
        <section className="mt-4 rounded-lg border border-dashed border-leaf bg-white p-3 shadow-soft">
          <button className="tap-target mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-4 py-2 font-semibold text-white" onClick={() => setCustomOpen(true)}>
            <BadgePlus size={18} /> Add custom product
          </button>
          {customOpen ? (
            <div className="grid gap-2">
              <input className="tap-target rounded-md border px-3" placeholder="Product name" value={customName} onChange={(event) => setCustomName(event.target.value)} />
              <input className="tap-target rounded-md border px-3" placeholder="Brand" value={customBrand} onChange={(event) => setCustomBrand(event.target.value)} />
              <input className="tap-target rounded-md border px-3" placeholder="Category" value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} />
              <button className="tap-target rounded-md bg-ink px-4 font-semibold text-white disabled:bg-zinc-300" onClick={createCustom} disabled={!canWriteStock(currentRole) || busy}>Create and use</button>
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Recent transactions</h2>
        <div className="space-y-2">
          {transactions.slice(0, 5).map((tx) => (
            <article key={tx.id} className="rounded-md border bg-white p-3 text-sm shadow-soft">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{tx.product_name}</span>
                <span className={tx.qty < 0 ? "font-bold text-red-700" : "font-bold text-leaf"}>{tx.qty > 0 ? `+${tx.qty}` : tx.qty}</span>
              </div>
              <div className="mt-1 text-zinc-600">{tx.type} · {tx.user_name} · <ClientTime value={tx.occurred_at} /></div>
              {!tx.reverses_transaction_id && currentRole === "owner" ? (
                <button className="mt-2 rounded-md border px-3 py-1 text-sm" onClick={async () => {
                  try {
                    await undoTransaction(tx.id);
                    setToast("Undo saved");
                  } catch (error) {
                    setToast(error instanceof Error ? error.message : "Could not undo");
                  }
                }}>Undo</button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      {toast ? (
        <div className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white shadow-soft">
          <span>{toast}</span>
          {lastTransactionId ? <button className="rounded bg-white/10 px-3 py-1" onClick={undoLast}>Undo</button> : null}
        </div>
      ) : null}
      {voiceIntent ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 px-3 pb-3" role="dialog" aria-modal="true">
          <section className="w-full rounded-lg bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase text-leaf">{commandSource === "voice" ? "Voice match" : "Chat match"}</div>
                <h2 className="text-xl font-bold">{voiceIntent.type === "sale" ? stockOutLabel : voiceIntent.type === "purchase" ? stockInLabel : voiceIntent.type}</h2>
                <p className="mt-1 text-sm text-zinc-600">“{voiceIntent.transcript}”</p>
              </div>
              <button className="rounded-md border p-2" onClick={() => { setVoiceIntent(null); setVoiceCandidates([]); setVoiceLogId(null); }} aria-label="Close voice match">
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 rounded-md bg-mist p-3">
              <div className="mb-2 text-sm font-semibold text-zinc-700">Quantity</div>
              <div className="flex items-center justify-between gap-3">
                <button className="tap-target rounded-md border bg-white px-5" onClick={() => updateVoiceQty(voiceIntent.qty - 1)} aria-label="Decrease voice quantity">
                  <Minus size={18} />
                </button>
                <input
                  className="w-24 rounded-md border bg-white px-3 py-2 text-center text-2xl font-bold"
                  value={voiceIntent.qty}
                  onChange={(event) => updateVoiceQty(Number(event.target.value) || 1)}
                  inputMode="numeric"
                />
                <button className="tap-target rounded-md border bg-white px-5" onClick={() => updateVoiceQty(voiceIntent.qty + 1)} aria-label="Increase voice quantity">
                  <Plus size={18} />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {voiceCandidates.map((candidate) => (
                <button key={candidate.product.tenant_product_id} className="tap-target w-full rounded-md border bg-white p-3 text-left shadow-soft" onClick={() => confirmVoiceCandidate(candidate)} disabled={busy || !roleCanUseMode}>
                  <div className="font-semibold">{candidate.product.display_name}</div>
                  <div className="text-sm text-zinc-600">{candidate.product.brand_name} · {candidate.product.category_name} · {candidate.product.on_hand ?? "not set"} on hand</div>
                </button>
              ))}
            </div>
            <button className="tap-target mt-3 w-full rounded-md border px-4 py-3 font-semibold" onClick={() => {
              setQuery(voiceIntent.transcript);
              setVoiceIntent(null);
              setVoiceCandidates([]);
              setVoiceLogId(null);
            }}>
              None of these
            </button>
          </section>
        </div>
      ) : null}
      <VoiceControl
        canUse={canWriteStock(currentRole)}
        onTranscript={handleVoiceTranscript}
        onError={(message) => setToast(message)}
        transcribeAudio={transcribeWithSarvam}
      />
      <ChatControl canUse={canWriteStock(currentRole)} onSubmit={handleChatMessage} />
      {selectedProduct ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 px-3 pb-3" role="dialog" aria-modal="true">
          <section className="w-full rounded-lg bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase text-leaf">{actionLabel}</div>
                <h2 className="text-xl font-bold">{selectedProduct.display_name}</h2>
                <p className="mt-1 text-sm text-zinc-600">{selectedProduct.brand_name} · {selectedProduct.category_name}</p>
              </div>
              <button className="rounded-md border p-2" onClick={() => setSelectedProduct(null)} aria-label="Close stock action">
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 rounded-md bg-mist p-3 text-sm">
              Current stock: <span className={typeof selectedProduct.on_hand === "number" && selectedProduct.on_hand < 0 ? "font-bold text-red-700" : "font-bold text-leaf"}>{selectedProduct.on_hand ?? "not set"}</span>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <button className="tap-target rounded-md border px-5" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity"><Minus size={18} /></button>
              <input className="w-24 rounded-md border px-3 py-2 text-center text-2xl font-bold" value={qty} onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))} inputMode="numeric" />
              <button className="tap-target rounded-md border px-5" onClick={() => setQty(qty + 1)} aria-label="Increase quantity"><Plus size={18} /></button>
            </div>
            <textarea className="mb-3 min-h-20 w-full rounded-md border px-3 py-2 text-sm" placeholder="Optional note" value={note} onChange={(event) => setNote(event.target.value)} />
            {willBeNegative ? <div className="mb-3 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">This will take stock below zero.</div> : null}
            {!roleCanUseMode ? <div className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">This role cannot record this transaction.</div> : null}
            <button className="tap-target w-full rounded-md bg-leaf px-4 py-3 font-bold text-white disabled:bg-zinc-300" onClick={commitSelectedProduct} disabled={!roleCanUseMode || busy}>
              {busy ? "Saving..." : "Confirm"}
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
