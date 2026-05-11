"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Mic, RefreshCw, XCircle } from "lucide-react";
import { ClientTime } from "@/components/ClientTime";
import { Shell } from "@/components/Shell";
import { useLocalStore } from "@/lib/localStore";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import type { VoiceLog } from "@/lib/types";

function readIntent(log: VoiceLog) {
  const qty = log.parsed_intent?.qty ?? 1;
  const type = log.parsed_intent?.type ?? "sale";
  if (log.parsed_intent?.action === "lookup") return "lookup";
  return `${type} x ${qty}`;
}

export default function VoiceAdmin({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const { backendMode, products, tenantId } = useLocalStore();
  const [logs, setLogs] = useState<VoiceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const productNames = useMemo(() => {
    return new Map(products.map((product) => [product.tenant_product_id, product.display_name]));
  }, [products]);

  async function loadLogs() {
    if (backendMode !== "supabase" || !tenantId || !isSupabaseConfigured()) {
      setLogs([]);
      setLoading(false);
      setMessage("Voice review is available after signing in with Supabase.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("voice_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setMessage(error.message);
      setLogs([]);
    } else {
      setMessage(null);
      setLogs((data ?? []) as VoiceLog[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLogs();
  }, [backendMode, tenantId]);

  return (
    <Shell locale={locale}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-leaf">Admin</p>
          <h1 className="text-2xl font-bold tracking-normal">Voice Review</h1>
        </div>
        <button className="tap-target rounded-md border bg-white p-3 shadow-soft" onClick={loadLogs} aria-label="Refresh voice logs">
          <RefreshCw size={18} />
        </button>
      </header>

      <section className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="text-xl font-bold">{logs.length}</div>
          <div className="text-xs text-zinc-500">Reviewed</div>
        </div>
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="text-xl font-bold">{logs.filter((log) => log.was_confirmed).length}</div>
          <div className="text-xs text-zinc-500">Confirmed</div>
        </div>
        <div className="rounded-md border bg-white p-3 shadow-soft">
          <div className="text-xl font-bold">
            {logs.length ? Math.round(logs.reduce((sum, log) => sum + (log.latency_ms ?? 0), 0) / logs.length) : 0}ms
          </div>
          <div className="text-xs text-zinc-500">Avg latency</div>
        </div>
      </section>

      {message ? <div className="mb-3 rounded-md bg-white p-3 text-sm shadow-soft">{message}</div> : null}
      {loading ? <div className="rounded-md bg-white p-3 text-sm shadow-soft">Loading voice logs...</div> : null}

      <div className="space-y-3">
        {logs.map((log) => {
          const matchedName = log.matched_tenant_product_id ? productNames.get(log.matched_tenant_product_id) : null;
          const candidateNames = (log.candidate_tenant_product_ids ?? [])
            .map((id) => productNames.get(id) ?? id.slice(0, 8))
            .slice(0, 2);
          return (
            <article key={log.id} className="rounded-md border bg-white p-3 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-leaf">
                    <Mic size={16} />
                    {readIntent(log)}
                  </div>
                  <h2 className="break-words text-lg font-bold">{log.raw_transcript || "No transcript"}</h2>
                </div>
                {log.was_confirmed ? <CheckCircle2 className="text-leaf" size={20} /> : <XCircle className="text-zinc-400" size={20} />}
              </div>
              <div className="mt-2 text-sm text-zinc-600">
                {matchedName ? `Confirmed: ${matchedName}` : "Not confirmed"}
              </div>
              {candidateNames.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidateNames.map((name) => (
                    <span key={name} className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-zinc-700">{name}</span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <Clock size={14} />
                <ClientTime value={log.created_at} /> · {log.language_detected ?? "unknown"} · {log.latency_ms ?? 0}ms
              </div>
            </article>
          );
        })}
      </div>
    </Shell>
  );
}
