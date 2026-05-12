"use client";

import { use, useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, FileDown, GitMerge, Search, ShieldAlert } from "lucide-react";
import review from "../../../../../catalog/review_candidates.json";
import { Shell } from "@/components/Shell";
import { friendlyError } from "@/lib/errors";
import { useLocalStore } from "@/lib/localStore";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

type ReviewItem = {
  admin_notes?: string;
  aliases: string[];
  brand_slug: string;
  canonical_name: string;
  category_code: string;
  decision: string;
  model_name: string;
  possible_duplicate_count?: number;
};

const decisions = ["create_master", "map_existing", "alias", "duplicate", "skip"];

export default function CatalogCurationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const { products } = useLocalStore();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [decision, setDecision] = useState("");
  const [localDecisions, setLocalDecisions] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const items = review as ReviewItem[];
  const customProducts = products.filter((product) => product.is_custom && product.custom_review_status !== "promoted");
  const filteredItems = useMemo(() => items.filter((item) => {
    const chosenDecision = localDecisions[keyFor(item)] ?? item.decision;
    const haystack = `${item.brand_slug} ${item.model_name} ${item.category_code} ${item.canonical_name} ${item.aliases.join(" ")}`.toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (brand && !item.brand_slug.toLowerCase().includes(brand.toLowerCase())) return false;
    if (category && !item.category_code.toLowerCase().includes(category.toLowerCase())) return false;
    if (decision && chosenDecision !== decision) return false;
    return true;
  }), [brand, category, decision, items, localDecisions, query]);
  const duplicateCount = filteredItems.filter((item) => item.possible_duplicate_count && item.possible_duplicate_count > 1).length;
  const aliasCount = filteredItems.filter((item) => (localDecisions[keyFor(item)] ?? item.decision) === "alias").length;

  async function promoteCustomProduct(id: string) {
    if (!isSupabaseConfigured()) {
      setMessage("Connect Supabase and sign in as platform admin to promote products.");
      return;
    }
    setBusyProductId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("promote_custom_product_to_master", { target_tenant_product: id });
      if (error) throw error;
      setMessage("Custom product promoted to master catalog.");
    } catch (error) {
      setMessage(friendlyError(error, "Could not promote product. Platform admin access is required."));
    } finally {
      setBusyProductId(null);
    }
  }

  function exportReviewCsv() {
    const rows = filteredItems.map((item) => {
      const key = keyFor(item);
      return [
        localDecisions[key] ?? item.decision,
        item.brand_slug,
        item.model_name,
        item.category_code,
        item.canonical_name,
        item.aliases.join("|"),
        notes[key] ?? item.admin_notes ?? ""
      ].map(csvCell).join(",");
    });
    const csv = ["decision,brand,model,category,canonical,aliases,notes", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `catalog-review-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell locale={locale}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catalog Curation</h1>
          <p className="text-sm text-zinc-600">Review aliases, duplicates, custom products, and master catalog promotion decisions.</p>
        </div>
        <button className="tap-target inline-flex items-center gap-2 rounded-md bg-leaf px-4 py-2 font-semibold text-white" onClick={exportReviewCsv}>
          <FileDown size={18} /> Export review
        </button>
      </div>

      <section className="mb-4 grid gap-2 md:grid-cols-4">
        <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 shadow-soft md:col-span-2">
          <Search size={18} />
          <input className="w-full bg-transparent outline-none" placeholder="Search model, alias, category" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <input className="tap-target rounded-md border bg-white px-3 shadow-soft" placeholder="Brand" value={brand} onChange={(event) => setBrand(event.target.value)} />
        <input className="tap-target rounded-md border bg-white px-3 shadow-soft" placeholder="Category" value={category} onChange={(event) => setCategory(event.target.value)} />
        <select className="tap-target rounded-md border bg-white px-3 shadow-soft" value={decision} onChange={(event) => setDecision(event.target.value)}>
          <option value="">All decisions</option>
          {decisions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </section>

      <section className="mb-5 grid grid-cols-3 gap-2 text-sm">
        <Metric icon={<BadgeCheck size={15} />} label="Review rows" value={filteredItems.length} />
        <Metric icon={<GitMerge size={15} />} label="Alias decisions" value={aliasCount} />
        <Metric icon={<ShieldAlert size={15} />} label="Possible duplicates" value={duplicateCount} tone="amber" />
      </section>

      {message ? <div className="mb-4 rounded-md bg-white p-3 text-sm shadow-soft">{message}</div> : null}

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-bold">Custom product promotion queue</h2>
        <div className="grid gap-2 lg:grid-cols-2">
          {customProducts.length ? customProducts.map((product) => (
            <article key={product.tenant_product_id} className="rounded-md border bg-white p-3 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{product.display_name}</div>
                  <div className="text-sm text-zinc-600">{product.brand_name} · {product.category_name}</div>
                  <div className="mt-1 text-xs font-semibold text-amber-700">{product.custom_review_status ?? "pending"} review</div>
                </div>
                <button className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white disabled:bg-zinc-300" onClick={() => promoteCustomProduct(product.tenant_product_id)} disabled={busyProductId === product.tenant_product_id}>
                  {busyProductId === product.tenant_product_id ? "Promoting..." : "Promote"}
                </button>
              </div>
            </article>
          )) : <div className="rounded-md border bg-white p-3 text-sm text-zinc-600 shadow-soft">No custom products waiting for review.</div>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">Seed review candidates</h2>
        <div className="overflow-x-auto rounded-lg border bg-white shadow-soft">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-100">
              <tr>
                <th className="p-2">Decision</th>
                <th className="p-2">Brand</th>
                <th className="p-2">Model</th>
                <th className="p-2">Category</th>
                <th className="p-2">Canonical</th>
                <th className="p-2">Aliases</th>
                <th className="p-2">Review notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.slice(0, 200).map((item) => {
                const key = keyFor(item);
                return (
                  <tr key={key} className={item.possible_duplicate_count && item.possible_duplicate_count > 1 ? "border-t bg-amber-50/50" : "border-t"}>
                    <td className="p-2">
                      <select className="rounded border px-2 py-1" value={localDecisions[key] ?? item.decision} onChange={(event) => setLocalDecisions((current) => ({ ...current, [key]: event.target.value }))}>
                        {decisions.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </td>
                    <td className="p-2">{item.brand_slug}</td>
                    <td className="p-2">{item.model_name}</td>
                    <td className="p-2">{item.category_code}</td>
                    <td className="p-2 font-semibold">{item.canonical_name}</td>
                    <td className="p-2">{item.aliases.join(", ") || "No aliases"}</td>
                    <td className="p-2">
                      <textarea
                        className="min-h-16 w-full rounded border px-2 py-1"
                        placeholder={item.possible_duplicate_count ? `${item.possible_duplicate_count} raw rows may duplicate` : "Add curation note"}
                        value={notes[key] ?? item.admin_notes ?? ""}
                        onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}

function keyFor(item: ReviewItem) {
  return `${item.brand_slug}-${item.category_code}-${item.canonical_name}`;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function Metric({ icon, label, tone, value }: { icon: ReactNode; label: string; tone?: "amber"; value: number }) {
  return (
    <div className="rounded-md border bg-white p-3 shadow-soft">
      <div className="flex items-center gap-1 text-zinc-600">{icon}{label}</div>
      <div className={tone === "amber" ? "mt-1 text-2xl font-bold text-amber-700" : "mt-1 text-2xl font-bold"}>{value}</div>
    </div>
  );
}
