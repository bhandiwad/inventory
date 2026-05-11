import review from "../../../../../catalog/review_candidates.json";

type ReviewItem = {
  decision: string;
  brand_slug: string;
  model_name: string;
  category_code: string;
  canonical_name: string;
  aliases: string[];
  possible_duplicate_count?: number;
  admin_notes?: string;
};

export default function CatalogCurationPage() {
  const items = (review as ReviewItem[]).slice(0, 100);
  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-mist p-4">
      <h1 className="mb-4 text-2xl font-bold">Catalog Curation</h1>
      <div className="mb-3 grid grid-cols-4 gap-2">
        <input className="rounded-md border px-3 py-2" placeholder="Brand" />
        <input className="rounded-md border px-3 py-2" placeholder="Category" />
        <select className="rounded-md border px-3 py-2"><option>pending</option><option>mapped</option><option>alias</option><option>duplicate</option><option>skipped</option></select>
        <button className="rounded-md bg-leaf px-3 py-2 font-semibold text-white">Export clean seed SQL</button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white shadow-soft">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-zinc-100">
            <tr>
              <th className="p-2">Decision</th>
              <th className="p-2">Brand</th>
              <th className="p-2">Model</th>
              <th className="p-2">Category</th>
              <th className="p-2">Canonical</th>
              <th className="p-2">Aliases</th>
              <th className="p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.brand_slug}-${item.category_code}-${item.canonical_name}`} className="border-t">
                <td className="p-2">
                  <select className="rounded border px-2 py-1" defaultValue={item.decision}>
                    <option>create_master</option>
                    <option>map_existing</option>
                    <option>alias</option>
                    <option>duplicate</option>
                    <option>skip</option>
                  </select>
                </td>
                <td className="p-2">{item.brand_slug}</td>
                <td className="p-2">{item.model_name}</td>
                <td className="p-2">{item.category_code}</td>
                <td className="p-2">{item.canonical_name}</td>
                <td className="p-2">{item.aliases.join(", ")}</td>
                <td className="p-2">{item.admin_notes}{item.possible_duplicate_count ? ` · ${item.possible_duplicate_count} raw rows` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
