"use client";

import { use, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgePlus, ChevronLeft, ChevronRight, Pencil, Search, X } from "lucide-react";
import { Shell } from "@/components/Shell";
import { productMatches, useLocalStore } from "@/lib/localStore";
import type { ProductCard } from "@/lib/types";

const pageSize = 25;

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

export default function Products({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const { addCustomProduct, currentRole, products, updateProduct } = useLocalStore();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("All brands");
  const [category, setCategory] = useState("All categories");
  const [page, setPage] = useState(1);
  const [customName, setCustomName] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductCard | null>(null);
  const [draft, setDraft] = useState({
    display_name: "",
    shop_label: "",
    tenant_notes: "",
    variant: "",
    aliasesText: "",
    reorder_threshold: "0",
    opening_balance: "0"
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const brands = useMemo(() => ["All brands", ...Array.from(new Set(products.map((product) => product.brand_name).filter(Boolean) as string[]))], [products]);
  const categories = useMemo(() => ["All categories", ...Array.from(new Set(products.map((product) => product.category_name).filter(Boolean) as string[]))], [products]);
  const filteredAll = useMemo(() => products.filter((product) => {
    if (brand !== "All brands" && product.brand_name !== brand) return false;
    if (category !== "All categories" && product.category_name !== category) return false;
    return productMatches(product, query);
  }), [brand, category, products, query]);
  const pageCount = Math.max(1, Math.ceil(filteredAll.length / pageSize));
  const filtered = filteredAll.slice((page - 1) * pageSize, page * pageSize);
  const alertCount = products.filter((product) => hasNegativeStock(product) || hasLowStock(product)).length;
  const brandSummaries = brands.filter((item) => item !== "All brands").map((item) => {
    const brandProducts = products.filter((product) => product.brand_name === item);
    const alerts = brandProducts.filter((product) => hasNegativeStock(product) || hasLowStock(product)).length;
    return { name: item, count: brandProducts.length, alerts };
  }).sort((a, b) => b.count - a.count);
  const universalProducts = products.filter((product) => product.brand_name === "Universal / Generic").slice(0, 3);
  const canEdit = currentRole === "owner";

  useEffect(() => {
    setPage(1);
  }, [brand, category, query]);

  function openEditor(product: ProductCard) {
    setSelectedProduct(product);
    setDraft({
      display_name: product.display_name,
      shop_label: product.shop_label ?? "",
      tenant_notes: product.tenant_notes ?? "",
      variant: product.variant ?? "",
      aliasesText: product.aliases?.join(", ") ?? "",
      reorder_threshold: String(product.reorder_threshold ?? 0),
      opening_balance: String(product.opening_balance ?? product.on_hand ?? 0)
    });
    setMessage(null);
  }

  async function createCustom() {
    if (!customName.trim()) return;
    setBusy(true);
    try {
      await addCustomProduct({ name: customName.trim(), brand: brand === "All brands" ? "Universal / Generic" : brand, category: category === "All categories" ? "LLM" : category });
      setCustomName("");
      setShowCustom(false);
      setMessage("Custom product is ready to use");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create product");
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct() {
    if (!selectedProduct || !canEdit) return;
    setBusy(true);
    try {
      await updateProduct(selectedProduct.tenant_product_id, {
        display_name: draft.display_name.trim() || selectedProduct.display_name,
        shop_label: draft.shop_label.trim() || null,
        tenant_notes: draft.tenant_notes.trim() || null,
        variant: draft.variant.trim() || null,
        aliasesText: draft.aliasesText,
        reorder_threshold: Math.max(0, Number(draft.reorder_threshold) || 0),
        opening_balance: Number(draft.opening_balance) || 0
      });
      setSelectedProduct(null);
      setMessage("Product updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell locale={locale}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-zinc-600">Find products, review stock, and tune shop-level settings.</p>
        </div>
        <div className="rounded-md bg-white px-3 py-2 text-right text-sm shadow-soft">
          <div className="font-bold">{products.length}</div>
          <div className="text-xs text-zinc-500">products</div>
        </div>
      </div>

      <label className="mb-3 flex items-center gap-2 rounded-md border bg-white px-3 py-2 shadow-soft">
        <Search size={18} />
        <input className="w-full bg-transparent outline-none" placeholder="BREZZA, BREEZA, Swift mat" value={query} onChange={(event) => setQuery(event.target.value)} onInput={(event) => setQuery(event.currentTarget.value)} />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <select className="tap-target rounded-md border bg-white px-3" value={brand} onChange={(event) => setBrand(event.target.value)}>
          {brands.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="tap-target rounded-md border bg-white px-3" value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>

      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase text-zinc-500">Car Brands</h2>
          {alertCount > 0 ? <span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{alertCount} stock alerts</span> : null}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {brandSummaries.slice(0, 12).map((item) => (
            <button key={item.name} className={`min-w-36 rounded-md border p-3 text-left shadow-soft ${brand === item.name ? "border-leaf bg-leaf text-white" : "bg-white"}`} onClick={() => setBrand(item.name)}>
              <div className="font-bold">{item.name}</div>
              <div className={brand === item.name ? "text-sm text-white/80" : "text-sm text-zinc-600"}>{item.count} products</div>
              {item.alerts > 0 ? <div className={brand === item.name ? "text-xs text-white/80" : "text-xs text-amber-700"}>{item.alerts} alerts</div> : null}
            </button>
          ))}
        </div>
      </section>

      {universalProducts.length ? (
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-zinc-500">Universal Products</h2>
            <button className="text-sm font-semibold text-leaf" onClick={() => setBrand("Universal / Generic")}>View all</button>
          </div>
          <div className="space-y-2">
            {universalProducts.map((product) => (
              <button key={product.tenant_product_id} className="w-full rounded-md border bg-white p-3 text-left shadow-soft" onClick={() => openEditor(product)}>
                <div className="font-semibold">{product.display_name}</div>
                <div className="text-sm text-zinc-600">{product.category_name} · {product.on_hand ?? "stock not set"} on hand</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-3 flex items-center justify-between text-sm text-zinc-600">
        <span>{filteredAll.length} products found</span>
        <span>Page {page} of {pageCount}</span>
      </div>

      <div className="overflow-hidden rounded-md border bg-white shadow-soft">
        {filtered.map((product) => {
          const negative = hasNegativeStock(product);
          const low = hasLowStock(product);
          return (
            <button key={product.tenant_product_id} className="grid w-full grid-cols-[1fr_auto] gap-3 border-b p-3 text-left last:border-b-0 active:bg-mist" onClick={() => openEditor(product)}>
              <div className="min-w-0">
                <div className="truncate font-semibold">{product.display_name}</div>
                <div className="truncate text-sm text-zinc-600">{product.brand_name} · {product.category_name}</div>
                {product.tenant_notes ? <div className="mt-1 truncate text-xs text-zinc-500">{product.tenant_notes}</div> : null}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {negative ? <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-red-700"><AlertTriangle size={13} />Negative</span> : null}
                  {low ? <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">Below reorder level</span> : null}
                  {product.custom_review_status ? <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-amber-800"><BadgePlus size={13} />Custom</span> : null}
                </div>
              </div>
              <div className={negative ? "text-right font-bold text-red-700" : "text-right font-bold text-leaf"}>
                {product.on_hand == null ? "not set" : product.on_hand}
                <div className="text-xs font-normal text-zinc-500">on hand</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="tap-target rounded-md border bg-white px-4 font-semibold disabled:bg-zinc-100" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
          <ChevronLeft size={16} className="mr-1 inline" /> Previous
        </button>
        <button className="tap-target rounded-md border bg-white px-4 font-semibold disabled:bg-zinc-100" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>
          Next <ChevronRight size={16} className="ml-1 inline" />
        </button>
      </div>

      <button className="tap-target mt-4 w-full rounded-md border border-dashed border-leaf bg-white px-4 py-3 font-semibold text-leaf disabled:border-zinc-300 disabled:text-zinc-400" onClick={() => setShowCustom((value) => !value)} disabled={currentRole === "viewer"}>
        Add custom product
      </button>
      {message ? <div className="mt-3 rounded-md bg-white p-3 text-sm shadow-soft">{message}</div> : null}
      {showCustom ? (
        <div className="mt-3 rounded-md border bg-white p-3 shadow-soft">
          <input className="tap-target mb-2 w-full rounded-md border px-3" placeholder="Product name" value={customName} onChange={(event) => setCustomName(event.target.value)} />
          <button className="tap-target w-full rounded-md bg-leaf px-4 font-semibold text-white disabled:bg-zinc-300" onClick={createCustom} disabled={busy}>{busy ? "Creating..." : "Create product"}</button>
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 px-3 pb-3" role="dialog" aria-modal="true">
          <section className="max-h-[92vh] w-full overflow-y-auto rounded-md bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase text-leaf"><Pencil size={15} /> Product</div>
                <h2 className="mt-1 text-xl font-bold">{selectedProduct.display_name}</h2>
                <p className="text-sm text-zinc-600">{selectedProduct.brand_name} · {selectedProduct.category_name}</p>
              </div>
              <button className="rounded-md border p-2" onClick={() => setSelectedProduct(null)} aria-label="Close product editor"><X size={18} /></button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-mist p-3">Stock <b>{selectedProduct.on_hand ?? "not set"}</b></div>
              <div className="rounded-md bg-mist p-3">Reorder <b>{selectedProduct.reorder_threshold ?? 0}</b></div>
            </div>

            <div className="grid gap-3">
              {selectedProduct.is_custom ? (
                <label className="grid gap-1 text-sm font-semibold">
                  Product name
                  <input className="tap-target rounded-md border px-3 font-normal" value={draft.display_name} onChange={(event) => setDraft((value) => ({ ...value, display_name: event.target.value }))} disabled={!canEdit} />
                </label>
              ) : (
                <label className="grid gap-1 text-sm font-semibold">
                  Shop label
                  <input className="tap-target rounded-md border px-3 font-normal" placeholder={selectedProduct.display_name} value={draft.shop_label} onChange={(event) => setDraft((value) => ({ ...value, shop_label: event.target.value }))} disabled={!canEdit} />
                </label>
              )}
              <label className="grid gap-1 text-sm font-semibold">
                Notes
                <textarea className="min-h-20 rounded-md border px-3 py-2 font-normal" value={draft.tenant_notes} onChange={(event) => setDraft((value) => ({ ...value, tenant_notes: event.target.value }))} disabled={!canEdit} />
              </label>
              {selectedProduct.is_custom ? (
                <>
                  <label className="grid gap-1 text-sm font-semibold">
                    Variant
                    <input className="tap-target rounded-md border px-3 font-normal" value={draft.variant} onChange={(event) => setDraft((value) => ({ ...value, variant: event.target.value }))} disabled={!canEdit} />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Aliases
                    <input className="tap-target rounded-md border px-3 font-normal" value={draft.aliasesText} onChange={(event) => setDraft((value) => ({ ...value, aliasesText: event.target.value }))} disabled={!canEdit} />
                  </label>
                </>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm font-semibold">
                  Reorder level
                  <input className="tap-target rounded-md border px-3 font-normal" value={draft.reorder_threshold} onChange={(event) => setDraft((value) => ({ ...value, reorder_threshold: event.target.value }))} inputMode="numeric" disabled={!canEdit} />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Opening stock
                  <input className="tap-target rounded-md border px-3 font-normal" value={draft.opening_balance} onChange={(event) => setDraft((value) => ({ ...value, opening_balance: event.target.value }))} inputMode="numeric" disabled={!canEdit} />
                </label>
              </div>
            </div>

            {!canEdit ? <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">Only an owner can edit product settings.</div> : null}
            <button className="tap-target mt-4 w-full rounded-md bg-leaf px-4 py-3 font-bold text-white disabled:bg-zinc-300" onClick={saveProduct} disabled={!canEdit || busy}>
              {busy ? "Saving..." : "Save changes"}
            </button>
          </section>
        </div>
      ) : null}
    </Shell>
  );
}
