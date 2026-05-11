"use client";

import Dexie, { type Table } from "dexie";
import { v4 as uuidv4 } from "uuid";
import { createClient, isSupabaseConfigured } from "./supabase";
import type { QueuedMutation, TenantRole, TransactionType } from "./types";
import { canQueueMutation } from "./permissions";

class InventoryDB extends Dexie {
  mutations!: Table<QueuedMutation, string>;

  constructor() {
    super("inventory_phase1");
    this.version(1).stores({
      mutations: "client_mutation_id, tenant_id, tenant_product_id, created_at"
    });
  }
}

export const db = new InventoryDB();

export function deviceId() {
  const key = "inventory_device_id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = uuidv4();
    localStorage.setItem(key, value);
  }
  return value;
}

export async function enqueueMutation(input: {
  role: TenantRole;
  tenant_id: string;
  tenant_product_id: string;
  qty: number;
  type: TransactionType;
  source?: QueuedMutation["source"];
  notes?: string;
}) {
  if (!canQueueMutation(input.role, input.type)) {
    throw new Error("viewer_or_role_cannot_queue_mutations");
  }
  const mutation: QueuedMutation = {
    client_mutation_id: uuidv4(),
    tenant_id: input.tenant_id,
    tenant_product_id: input.tenant_product_id,
    qty: input.qty,
    type: input.type,
    source: input.source ?? "manual",
    notes: input.notes,
    created_at: new Date().toISOString(),
    device_id: deviceId()
  };
  await db.mutations.put(mutation);
  return mutation;
}

export async function syncQueuedMutations() {
  if (!isSupabaseConfigured()) {
    return [{ id: "supabase", message: "Supabase is not configured; queued writes stay local." }];
  }
  const supabase = createClient();
  const items = await db.mutations.orderBy("created_at").toArray();
  const failures: Array<{ id: string; message: string }> = [];
  for (const item of items) {
    const { error } = await supabase.from("transactions").insert({
      tenant_id: item.tenant_id,
      tenant_product_id: item.tenant_product_id,
      qty: item.qty,
      type: item.type,
      source: item.source,
      notes: item.notes,
      client_mutation_id: item.client_mutation_id,
      device_id: item.device_id,
      created_offline: true
    });
    if (!error || error.code === "23505") {
      await db.mutations.delete(item.client_mutation_id);
    } else {
      failures.push({ id: item.client_mutation_id, message: error.message });
    }
  }
  return failures;
}
