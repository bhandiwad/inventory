"use client";

import { use, useState } from "react";
import { UserPlus } from "lucide-react";
import { Shell } from "@/components/Shell";
import { useLocalStore } from "@/lib/localStore";
import { isLikelyE164Phone, normalizeIndianPhone } from "@/lib/phone";
import type { TenantRole } from "@/lib/types";

export default function Users({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const { addUser, currentRole, updateUser, users } = useLocalStore();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<TenantRole>("staff");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownerCount = users.filter((user) => user.role === "owner" && user.is_active).length;
  const canManage = currentRole === "owner";

  async function createUser() {
    if (!name.trim() || !phone.trim()) return;
    const normalizedPhone = normalizeIndianPhone(phone);
    if (!isLikelyE164Phone(normalizedPhone)) {
      setMessage("Enter a valid phone number, for example 9876543210 or +919876543210.");
      return;
    }
    setBusy(true);
    try {
      await addUser({ name: name.trim(), phone: normalizedPhone, role });
      setName("");
      setPhone("");
      setRole("staff");
      setShowAdd(false);
      setMessage("User access updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update users");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell locale={locale}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-zinc-600">{canManage ? "Owner controls enabled" : "Staff/viewer cannot manage users"}</p>
        </div>
        <button className="tap-target rounded-md bg-leaf px-3 text-white disabled:bg-zinc-300" aria-label="Add user" onClick={() => setShowAdd((value) => !value)} disabled={!canManage}>
          <UserPlus size={18} />
        </button>
      </div>
      {showAdd ? (
        <section className="mb-3 rounded-lg border bg-white p-3 shadow-soft">
          <div className="grid gap-2">
            <input className="tap-target rounded-md border px-3" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
            <input className="tap-target rounded-md border px-3" placeholder="+91 phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <select className="tap-target rounded-md border px-3" value={role} onChange={(event) => setRole(event.target.value as TenantRole)}>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
            <button className="tap-target rounded-md bg-leaf px-4 font-semibold text-white disabled:bg-zinc-300" onClick={createUser} disabled={busy}>Create user</button>
          </div>
        </section>
      ) : null}
      {message ? <div className="mb-3 rounded-md bg-white p-3 text-sm shadow-soft">{message}</div> : null}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => {
          const soleOwnerLock = user.role === "owner" && user.is_active && ownerCount <= 1;
          return (
            <article key={user.id} className="rounded-lg border bg-white p-3 shadow-soft">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="font-semibold">{user.name}</div>
                  <div className="text-sm text-zinc-600">{user.phone}</div>
                </div>
                <span className={`h-fit rounded px-2 py-1 text-xs ${user.is_active ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{user.is_active ? "active" : "inactive"}</span>
              </div>
              <select className="tap-target mt-2 w-full rounded-md border bg-white px-3" value={user.role} disabled={!canManage || soleOwnerLock || busy} onChange={async (event) => {
                setBusy(true);
                try {
                  await updateUser(user.id, { role: event.target.value as TenantRole });
                  setMessage("Role updated");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Could not update role");
                } finally {
                  setBusy(false);
                }
              }}>
                <option value="owner">Owner</option>
                <option value="staff">Staff</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="tap-target mt-2 w-full rounded-md border px-3 disabled:bg-zinc-100" disabled={!canManage || soleOwnerLock || busy} onClick={async () => {
                setBusy(true);
                try {
                  await updateUser(user.id, { is_active: !user.is_active });
                  setMessage(user.is_active ? "User deactivated" : "User reactivated");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Could not update user");
                } finally {
                  setBusy(false);
                }
              }}>
                {user.is_active ? "Deactivate" : "Reactivate"}
              </button>
              {soleOwnerLock ? <div className="mt-2 text-xs text-amber-800">Sole owner cannot remove or demote themselves.</div> : null}
            </article>
          );
        })}
      </div>
    </Shell>
  );
}
