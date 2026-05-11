"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

export function ChatControl({
  canUse,
  onSubmit
}: {
  canUse: boolean;
  onSubmit(message: string): Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!message.trim() || !canUse) return;
    setBusy(true);
    try {
      await onSubmit(message.trim());
      setMessage("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        aria-label={open ? "Close chat command" : "Open chat command"}
        className={`fixed bottom-20 right-[calc(50%-13rem)] z-40 grid h-12 w-12 place-items-center rounded-full shadow-soft max-[480px]:right-4 ${canUse ? "bg-ink text-white" : "bg-zinc-300 text-zinc-600"}`}
        disabled={!canUse}
        onClick={() => setOpen((value) => !value)}
        title={canUse ? "Type stock command" : "Viewer cannot update stock"}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
      {open ? (
        <div className="fixed bottom-36 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md border bg-white p-3 shadow-soft">
          <label className="mb-2 block text-sm font-semibold">Chat command</label>
          <div className="flex gap-2">
            <input
              className="tap-target min-w-0 flex-1 rounded-md border px-3"
              placeholder="sell 2 Brezza LLM"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
            <button className="tap-target rounded-md bg-leaf px-4 text-white disabled:bg-zinc-300" onClick={submit} disabled={!message.trim() || busy} aria-label="Send chat command">
              <Send size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
