"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useLocalStore } from "@/lib/localStore";

const brandOptions = ["Maruti", "Nexa", "Tata", "Mahindra", "Hyundai", "Kia", "Toyota"];
const categoryOptions = ["LLM", "TRUNK_MAT", "PARCEL_TRAY", "FOOTSTEP", "WFK", "DVSL"];

export default function OnboardingPage() {
  const { onboarding, saveOnboarding } = useLocalStore();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({
    shopName: onboarding.shopName ?? "",
    ownerName: onboarding.ownerName ?? "",
    city: onboarding.city ?? "",
    state: onboarding.state ?? "",
    primaryLanguage: onboarding.primaryLanguage ?? "English",
    brands: onboarding.brands ?? "Maruti,Hyundai",
    categories: onboarding.categories ?? "LLM,TRUNK_MAT",
    openingBalance: onboarding.openingBalance ?? "",
    invitePhone: onboarding.invitePhone ?? ""
  });
  const steps = [
    "Shop",
    "Location",
    "Language",
    "Brands",
    "Categories",
    "Opening balance",
    "Invite staff"
  ];

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function finish() {
    if (!values.shopName.trim() || !values.ownerName.trim()) {
      setStep(0);
      setMessage("Shop name and owner name are required.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveOnboarding(values);
      router.push("/en");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not finish onboarding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-mist p-4">
      <h1 className="mb-2 text-2xl font-bold">Onboarding</h1>
      <p className="mb-4 text-sm text-zinc-600">Opening balance can be skipped and filled later.</p>
      <div className="mb-4 flex gap-1">
        {steps.map((item, index) => (
          <button key={item} aria-label={item} className={`h-2 flex-1 rounded ${index <= step ? "bg-leaf" : "bg-zinc-300"}`} onClick={() => setStep(index)} />
        ))}
      </div>
      <section className="rounded-lg border bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center gap-2 font-bold"><Check size={18} /> {steps[step]}</div>
        {step === 0 ? (
          <div className="grid gap-2">
            <input className="tap-target rounded-md border px-3" placeholder="Shop name" value={values.shopName} onChange={(event) => setValue("shopName", event.target.value)} />
            <input className="tap-target rounded-md border px-3" placeholder="Owner name" value={values.ownerName} onChange={(event) => setValue("ownerName", event.target.value)} />
          </div>
        ) : null}
        {step === 1 ? (
          <div className="grid gap-2">
            <input className="tap-target rounded-md border px-3" placeholder="City" value={values.city} onChange={(event) => setValue("city", event.target.value)} />
            <input className="tap-target rounded-md border px-3" placeholder="State" value={values.state} onChange={(event) => setValue("state", event.target.value)} />
          </div>
        ) : null}
        {step === 2 ? (
          <select className="tap-target w-full rounded-md border px-3" value={values.primaryLanguage} onChange={(event) => setValue("primaryLanguage", event.target.value)}>
            <option>English</option>
            <option>Kannada</option>
            <option>Hindi</option>
          </select>
        ) : null}
        {step === 3 ? (
          <div className="grid grid-cols-2 gap-2">
            {brandOptions.map((brand) => (
              <label key={brand} className="rounded-md border p-2"><input type="checkbox" className="mr-2" defaultChecked={values.brands.includes(brand)} />{brand}</label>
            ))}
          </div>
        ) : null}
        {step === 4 ? (
          <div className="grid grid-cols-2 gap-2">
            {categoryOptions.map((category) => (
              <label key={category} className="rounded-md border p-2"><input type="checkbox" className="mr-2" defaultChecked={values.categories.includes(category)} />{category}</label>
            ))}
          </div>
        ) : null}
        {step === 5 ? (
          <input className="tap-target w-full rounded-md border px-3" placeholder="Optional opening balance note" value={values.openingBalance} onChange={(event) => setValue("openingBalance", event.target.value)} />
        ) : null}
        {step === 6 ? (
          <input className="tap-target w-full rounded-md border px-3" placeholder="Optional staff phone" value={values.invitePhone} onChange={(event) => setValue("invitePhone", event.target.value)} />
        ) : null}
      </section>
      {message ? <div className="mt-3 rounded-md bg-white p-3 text-sm shadow-soft">{message}</div> : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="tap-target rounded-md border bg-white px-4 font-semibold" onClick={() => setStep(Math.max(0, step - 1))}>Back</button>
        {step < steps.length - 1 ? (
          <button className="tap-target rounded-md bg-leaf px-4 font-semibold text-white" onClick={() => setStep(step + 1)}>Continue</button>
        ) : (
          <button className="tap-target rounded-md bg-leaf px-4 font-semibold text-white disabled:bg-zinc-300" onClick={finish} disabled={busy}>{busy ? "Setting up..." : "Finish"}</button>
        )}
      </div>
    </main>
  );
}
