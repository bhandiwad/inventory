"use client";

import { use } from "react";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendOtp() {
    if (!isSupabaseConfigured()) {
      setMessage("Supabase env vars are missing. Add them to .env.local to send OTP.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setOtpSent(true);
    setMessage("OTP sent");
  }

  async function verifyOtp() {
    if (!isSupabaseConfigured()) {
      setMessage("Supabase is not configured.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }
    await supabase.rpc("accept_pending_tenant_invites", { user_phone: phone });
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const { data: memberships, error: membershipError } = userId
      ? await supabase
          .from("tenant_memberships")
          .select("tenant_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .limit(1)
      : { data: null, error: null };
    setLoading(false);
    if (membershipError) {
      setMessage(membershipError.message);
      return;
    }
    window.location.href = memberships?.length ? `/${locale}` : `/${locale}/onboarding`;
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-mist p-4">
      <div className="mb-5">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-lg bg-leaf text-white">
          <ShieldCheck size={24} />
        </div>
        <h1 className="text-2xl font-bold">Phone login</h1>
        <p className="mt-1 text-sm text-zinc-600">Use the shop owner or invited staff phone number.</p>
      </div>
      <section className="rounded-lg border bg-white p-4 shadow-soft">
        <label className="mb-2 block text-sm font-semibold">Phone number</label>
        <input className="tap-target mb-3 w-full rounded-md border px-3" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." inputMode="tel" disabled={otpSent} />
        {!otpSent ? (
          <button className="tap-target w-full rounded-md bg-leaf px-4 font-semibold text-white disabled:bg-zinc-300" onClick={sendOtp} disabled={loading || phone.length < 8}>
            {loading ? "Sending..." : "Send OTP"}
          </button>
        ) : (
          <>
            <label className="mb-2 block text-sm font-semibold">OTP</label>
            <input className="tap-target mb-3 w-full rounded-md border px-3 text-center text-xl tracking-[0.3em]" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="000000" inputMode="numeric" />
            <button className="tap-target w-full rounded-md bg-leaf px-4 font-semibold text-white disabled:bg-zinc-300" onClick={verifyOtp} disabled={loading || otp.length < 4}>
              {loading ? "Verifying..." : "Verify and continue"}
            </button>
            <button className="tap-target mt-2 w-full rounded-md border px-4 font-semibold" onClick={() => { setOtpSent(false); setOtp(""); setMessage(null); }}>
              Change number
            </button>
          </>
        )}
        {message ? <p className="mt-3 text-sm text-zinc-700">{message}</p> : null}
        {!otpSent ? <p className="mt-3 text-xs text-zinc-500">New owners continue to shop setup after OTP. Invited staff and viewers open the existing shop automatically.</p> : null}
      </section>
    </main>
  );
}
