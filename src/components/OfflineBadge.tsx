"use client";

import { useEffect, useState } from "react";
import { db, syncQueuedMutations } from "@/lib/offlineQueue";

export function OfflineBadge() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const refresh = async () => setPending(await db.mutations.count());
    const onOnline = async () => {
      setOnline(true);
      const failures = await syncQueuedMutations();
      setFailure(failures[0]?.message ?? null);
      await refresh();
      window.dispatchEvent(new Event("inventory:sync-complete"));
    };
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = window.setInterval(refresh, 1500);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-soft">
      <span className={online ? "text-leaf" : "text-saffron"}>{online ? "Online" : "Offline"}</span>
      <span className="ml-2 text-zinc-600">{pending} pending</span>
      {failure ? <div className="mt-1 text-xs text-red-700">{failure}</div> : null}
    </div>
  );
}
