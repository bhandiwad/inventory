"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoBaseTime, demoProducts, demoTenantId, demoTransactions, demoUsers } from "./demoData";
import { enqueueMutation } from "./offlineQueue";
import { createClient, isSupabaseConfigured } from "./supabase";
import type { CommandSource, InventoryTransaction, ProductCard, TenantRole, TenantUser, TransactionType, VoiceCandidate, VoiceIntent } from "./types";
import { findVoiceCandidates, voiceProductQuery } from "./voice";

type BackendMode = "demo" | "supabase";

type State = {
  backendMode: BackendMode;
  tenantId: string | null;
  products: ProductCard[];
  transactions: InventoryTransaction[];
  users: TenantUser[];
  currentRole: TenantRole;
  onboarding: Record<string, string>;
  lastSyncedAt: string;
  loading: boolean;
  statusMessage: string | null;
};

type AddTransactionInput = {
  tenant_product_id: string;
  qty: number;
  type: TransactionType;
  notes?: string;
  created_offline?: boolean;
  reverses_transaction_id?: string;
  source?: "manual" | CommandSource | "import";
  voice_log_id?: string;
};

type CreateVoiceLogInput = {
  intent: VoiceIntent;
  candidateIds: string[];
  latencyMs?: number;
};

type Store = State & {
  refresh(): Promise<void>;
  addTransaction(input: AddTransactionInput): Promise<InventoryTransaction>;
  undoTransaction(id: string): Promise<void>;
  addCustomProduct(input: { name: string; brand: string; category: string; model?: string; variant?: string }): Promise<ProductCard>;
  searchVoiceCandidates(transcript: string, limit?: number): Promise<VoiceCandidate[]>;
  createVoiceLog(input: CreateVoiceLogInput): Promise<string | null>;
  confirmVoiceLog(id: string | null, productId: string): Promise<void>;
  updateProduct(id: string, patch: Partial<ProductCard> & { aliasesText?: string }): Promise<void>;
  updateUser(id: string, patch: Partial<TenantUser>): Promise<void>;
  addUser(input: { name: string; phone: string; role: TenantRole }): Promise<void>;
  setCurrentRole(role: TenantRole): void;
  saveOnboarding(values: Record<string, string>): Promise<void>;
  resetDemo(): void;
};

const storageKey = "inventory_phase1_local_state_v5_clean_catalog_labels";

const initialState: State = {
  backendMode: "demo",
  tenantId: null,
  products: demoProducts,
  transactions: demoTransactions,
  users: demoUsers,
  currentRole: "owner",
  onboarding: {},
  lastSyncedAt: demoBaseTime,
  loading: true,
  statusMessage: null
};

const LocalStoreContext = createContext<Store | null>(null);

function applyQty(products: ProductCard[], productId: string, qty: number) {
  return products.map((product) => {
    if (product.tenant_product_id !== productId) return product;
    return {
      ...product,
      on_hand: typeof product.on_hand === "number" ? product.on_hand + qty : qty,
      last_movement_at: new Date().toISOString()
    };
  });
}

function readDemoState(): Partial<State> {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Partial<State>) : {};
  } catch {
    return {};
  }
}

function persistDemoState(state: State) {
  if (state.backendMode !== "demo") return;
  localStorage.setItem(storageKey, JSON.stringify({ ...state, loading: false, statusMessage: null }));
}

function cleanCategoryLabel(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/\s+-\s+confirm.*$/i, "").trim();
}

function normalizeCategoryCode(value: string | null | undefined) {
  const label = cleanCategoryLabel(value)?.trim() ?? "LLM";
  const known = new Map([
    ["Trunk mat", "TRUNK_MAT"],
    ["Parcel tray", "PARCEL_TRAY"],
    ["Footstep", "FOOTSTEP"],
    ["Door edge", "DOOR_EDGE"],
    ["Door handle", "DOOR_HANDLE"],
    ["Grass mat", "GRASSMAT"]
  ]);
  const fallback = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "LLM";
  return known.get(label) ?? fallback;
}

function mapInventory(row: any): ProductCard {
  return {
    tenant_product_id: row.tenant_product_id,
    display_name: row.display_name,
    shop_label: row.shop_label,
    tenant_notes: row.tenant_notes,
    brand_name: row.brand_name,
    category_name: cleanCategoryLabel(row.category_name),
    aliases: row.aliases ?? [],
    variant: row.variant,
    is_custom: row.is_custom,
    custom_review_status: row.custom_review_status,
    reorder_threshold: Number(row.reorder_threshold ?? 0),
    opening_balance: row.opening_balance == null ? null : Number(row.opening_balance),
    on_hand: row.on_hand == null ? null : Number(row.on_hand),
    last_movement_at: row.last_movement_at
  };
}

function mapTransaction(row: any, products: ProductCard[], userName = "User"): InventoryTransaction {
  const product = products.find((item) => item.tenant_product_id === row.tenant_product_id);
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    tenant_product_id: row.tenant_product_id,
    product_name: product?.display_name ?? "Product",
    qty: Number(row.qty),
    type: row.type,
    source: row.source,
    user_name: userName,
    occurred_at: row.occurred_at,
    notes: row.notes,
    reverses_transaction_id: row.reverses_transaction_id,
    created_offline: row.created_offline
  };
}

export function LocalStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);

  async function loadSupabase() {
    if (!isSupabaseConfigured()) {
      setState((current) => ({ ...current, ...readDemoState(), loading: false, backendMode: "demo", statusMessage: null }));
      return;
    }

    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      setState((current) => ({ ...current, ...readDemoState(), loading: false, backendMode: "demo", statusMessage: "Sign in to use Supabase." }));
      return;
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1);

    if (membershipError) {
      setState((current) => ({ ...current, loading: false, statusMessage: membershipError.message }));
      return;
    }

    const membership = memberships?.[0];
    if (!membership) {
      setState((current) => ({
        ...current,
        backendMode: "supabase",
        tenantId: null,
        products: [],
        transactions: [],
        users: [],
        currentRole: "owner",
        loading: false,
        statusMessage: "Finish onboarding to create your shop."
      }));
      return;
    }

    const tenantId = membership.tenant_id as string;
    const [{ data: inventory, error: inventoryError }, { data: transactionRows, error: transactionError }, { data: memberRows }, { data: inviteRows }] = await Promise.all([
      supabase.from("tenant_inventory").select("*").eq("tenant_id", tenantId).order("brand_name").order("display_name"),
      supabase.from("transactions").select("*").eq("tenant_id", tenantId).order("occurred_at", { ascending: false }).limit(100),
      supabase.from("tenant_memberships").select("user_id, role, is_active, profiles(id, name, phone)").eq("tenant_id", tenantId),
      supabase.from("tenant_member_invites").select("id, phone, role, is_active").eq("tenant_id", tenantId)
    ]);

    if (inventoryError || transactionError) {
      setState((current) => ({ ...current, loading: false, statusMessage: inventoryError?.message ?? transactionError?.message ?? "Load failed" }));
      return;
    }

    const products = (inventory ?? []).map(mapInventory);
    const users: TenantUser[] = (memberRows ?? []).map((row: any) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
      id: row.user_id,
      name: profile?.name ?? profile?.phone ?? "User",
      phone: profile?.phone ?? "",
      role: row.role,
      is_active: row.is_active
    };
    });
    const invites: TenantUser[] = (inviteRows ?? []).map((row: any) => ({
      id: `invite:${row.id}`,
      name: "Pending user",
      phone: row.phone,
      role: row.role,
      is_active: row.is_active
    }));

    setState({
      backendMode: "supabase",
      tenantId,
      products,
      transactions: (transactionRows ?? []).map((row: any) => mapTransaction(row, products)),
      users: [...users, ...invites],
      currentRole: membership.role as TenantRole,
      onboarding: {},
      lastSyncedAt: new Date().toISOString(),
      loading: false,
      statusMessage: null
    });
  }

  useEffect(() => {
    loadSupabase();
  }, []);

  useEffect(() => {
    const refreshAfterSync = () => {
      loadSupabase();
    };
    window.addEventListener("inventory:sync-complete", refreshAfterSync);
    return () => window.removeEventListener("inventory:sync-complete", refreshAfterSync);
  }, []);

  useEffect(() => {
    persistDemoState(state);
  }, [state]);

  const store = useMemo<Store>(() => {
    async function addTransaction(input: AddTransactionInput) {
      const product = state.products.find((item) => item.tenant_product_id === input.tenant_product_id);
      if (state.backendMode === "supabase" && state.tenantId) {
        if (!navigator.onLine) {
          const queued = await enqueueMutation({
            role: state.currentRole,
            tenant_id: state.tenantId,
            tenant_product_id: input.tenant_product_id,
            qty: input.qty,
            type: input.type,
            source: input.source ?? "manual",
            notes: input.notes
          });
          const tx = mapTransaction({
            id: queued.client_mutation_id,
            tenant_id: queued.tenant_id,
            tenant_product_id: queued.tenant_product_id,
            qty: queued.qty,
            type: queued.type,
            source: queued.source,
            notes: queued.notes,
            occurred_at: queued.created_at,
            created_offline: true
          }, state.products, "Pending sync");
          setState((current) => ({
            ...current,
            products: applyQty(current.products, input.tenant_product_id, input.qty),
            transactions: [tx, ...current.transactions]
          }));
          return tx;
        }
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const { data, error } = await supabase
          .from("transactions")
          .insert({
            tenant_id: state.tenantId,
            tenant_product_id: input.tenant_product_id,
            qty: input.qty,
            type: input.type,
            source: input.source ?? "manual",
            notes: input.notes,
            reverses_transaction_id: input.reverses_transaction_id,
            voice_log_id: input.voice_log_id,
            user_id: sessionData.session?.user.id,
            client_mutation_id: crypto.randomUUID(),
            device_id: localStorage.getItem("inventory_device_id"),
            created_offline: input.created_offline
          })
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        const tx = mapTransaction(data, state.products);
        setState((current) => ({
          ...current,
          products: applyQty(current.products, input.tenant_product_id, input.qty),
          transactions: [tx, ...current.transactions],
          lastSyncedAt: new Date().toISOString()
        }));
        return tx;
      }

      const tx: InventoryTransaction = {
        id: crypto.randomUUID(),
        tenant_id: demoTenantId,
        tenant_product_id: input.tenant_product_id,
        product_name: product?.display_name ?? "Unknown product",
        qty: input.qty,
        type: input.type,
        source: input.source ?? "manual",
        user_name: state.users.find((user) => user.id === state.currentRole)?.name ?? "Owner",
        occurred_at: new Date().toISOString(),
        notes: input.notes,
        reverses_transaction_id: input.reverses_transaction_id,
        created_offline: input.created_offline
      };
      setState((current) => ({
        ...current,
        products: applyQty(current.products, input.tenant_product_id, input.qty),
        transactions: [tx, ...current.transactions],
        lastSyncedAt: new Date().toISOString()
      }));
      return tx;
    }

    async function undoTransaction(id: string) {
      const original = state.transactions.find((tx) => tx.id === id);
      if (!original) return;
      if (state.backendMode === "supabase" && state.tenantId) {
        await addTransaction({
          tenant_product_id: original.tenant_product_id,
          qty: -original.qty,
          type: original.type,
          notes: "Undo",
          reverses_transaction_id: original.id
        });
        return;
      }
      const tx: InventoryTransaction = {
        ...original,
        id: crypto.randomUUID(),
        qty: -original.qty,
        occurred_at: new Date().toISOString(),
        reverses_transaction_id: original.id,
        notes: "Undo"
      };
      setState((current) => ({
        ...current,
        products: applyQty(current.products, original.tenant_product_id, -original.qty),
        transactions: [tx, ...current.transactions]
      }));
    }

    async function addCustomProduct(input: { name: string; brand: string; category: string; model?: string; variant?: string }) {
      if (state.backendMode === "supabase" && state.tenantId) {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("create_custom_tenant_product", {
          target_tenant: state.tenantId,
          product_name: input.name,
          brand_name: input.brand,
          category_code: normalizeCategoryCode(input.category),
          variant: input.variant ?? null,
          aliases: [input.name, input.model ?? ""].filter(Boolean)
        });
        if (error) throw new Error(error.message);
        await loadSupabase();
        const product: ProductCard = {
          tenant_product_id: data as string,
          display_name: input.name,
          brand_name: input.brand,
          category_name: cleanCategoryLabel(input.category),
          aliases: [input.name],
          on_hand: 0,
          is_custom: true,
          custom_review_status: "pending"
        };
        return product;
      }
      const product: ProductCard = {
        tenant_product_id: crypto.randomUUID(),
        display_name: input.name,
        brand_name: input.brand,
        category_name: input.category,
        variant: input.variant,
        aliases: [input.name, input.model ?? ""].filter(Boolean),
        on_hand: 0,
        reorder_threshold: 0,
        is_custom: true,
        custom_review_status: "pending",
        last_movement_at: new Date().toISOString()
      };
      setState((current) => ({ ...current, products: [product, ...current.products] }));
      return product;
    }

    return {
      ...state,
      refresh: loadSupabase,
      addTransaction,
      undoTransaction,
      addCustomProduct,
      async searchVoiceCandidates(transcript, limit = 2) {
        const fallback = () => findVoiceCandidates(state.products, transcript, limit);
        if (state.backendMode !== "supabase" || !state.tenantId || !isSupabaseConfigured()) return fallback();
        const query = voiceProductQuery(transcript);
        if (!query) return [];
        const supabase = createClient();
        const { data, error } = await supabase.rpc("search_tenant_products", {
          target_tenant: state.tenantId,
          q: query,
          limit_count: limit
        });
        if (error) return fallback();
        const candidates = (data ?? [])
          .map((row: any) => {
            const product = state.products.find((item) => item.tenant_product_id === row.tenant_product_id);
            return product ? { product, score: Number(row.similarity_score ?? 0) } : null;
          })
          .filter(Boolean) as VoiceCandidate[];
        return candidates.length ? candidates.slice(0, limit) : fallback();
      },
      async createVoiceLog(input) {
        if (state.backendMode === "supabase" && state.tenantId) {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("voice_logs")
            .insert({
              tenant_id: state.tenantId,
              raw_transcript: input.intent.transcript,
              language_detected: input.intent.language,
              parsed_intent: { qty: input.intent.qty, type: input.intent.type },
              candidate_tenant_product_ids: input.candidateIds,
              latency_ms: input.latencyMs
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          return data.id as string;
        }
        return crypto.randomUUID();
      },
      async confirmVoiceLog(id, productId) {
        if (!id) return;
        if (state.backendMode === "supabase" && state.tenantId) {
          const supabase = createClient();
          const { error } = await supabase
            .from("voice_logs")
            .update({ matched_tenant_product_id: productId, was_confirmed: true })
            .eq("tenant_id", state.tenantId)
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      },
      async updateProduct(id, patch) {
        const nextAliases = patch.aliasesText
          ?.split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (state.backendMode === "supabase" && state.tenantId) {
          const product = state.products.find((item) => item.tenant_product_id === id);
          const supabase = createClient();
          const update: Record<string, unknown> = {
            reorder_threshold: patch.reorder_threshold,
            opening_balance: patch.opening_balance,
            tenant_label: patch.shop_label,
            tenant_notes: patch.tenant_notes
          };
          if (product?.is_custom) {
            update.custom_name = patch.display_name;
            update.custom_variant = patch.variant;
            update.custom_aliases = nextAliases;
          }
          Object.keys(update).forEach((key) => {
            if (update[key] === undefined) delete update[key];
          });
          const { error } = await supabase
            .from("tenant_products")
            .update(update)
            .eq("tenant_id", state.tenantId)
            .eq("id", id);
          if (error) throw new Error(error.message);
          await loadSupabase();
          return;
        }
        setState((current) => ({
          ...current,
          products: current.products.map((product) => {
            if (product.tenant_product_id !== id) return product;
            const displayName = product.is_custom && patch.display_name ? patch.display_name : patch.shop_label || product.display_name;
            return {
              ...product,
              ...patch,
              display_name: displayName,
              aliases: nextAliases ?? product.aliases
            };
          })
        }));
      },
      async updateUser(id, patch) {
        if (state.backendMode === "supabase" && state.tenantId && !id.startsWith("invite:")) {
          const supabase = createClient();
          const { error } = await supabase
            .from("tenant_memberships")
            .update({ role: patch.role, is_active: patch.is_active })
            .eq("tenant_id", state.tenantId)
            .eq("user_id", id);
          if (error) throw new Error(error.message);
          await loadSupabase();
          return;
        }
        setState((current) => ({ ...current, users: current.users.map((user) => (user.id === id ? { ...user, ...patch } : user)) }));
      },
      async addUser(input) {
        if (state.backendMode === "supabase" && state.tenantId) {
          const supabase = createClient();
          const { error } = await supabase.rpc("invite_tenant_member", {
            target_tenant: state.tenantId,
            target_phone: input.phone,
            target_role: input.role
          });
          if (error) throw new Error(error.message);
          await loadSupabase();
          return;
        }
        setState((current) => ({ ...current, users: [{ id: crypto.randomUUID(), is_active: true, ...input }, ...current.users] }));
      },
      setCurrentRole(role) {
        if (state.backendMode === "demo") setState((current) => ({ ...current, currentRole: role }));
      },
      async saveOnboarding(values) {
        if (state.backendMode === "supabase") {
          const supabase = createClient();
          const { data: tenantId, error } = await supabase.rpc("create_tenant_with_owner", {
            shop_name: values.shopName,
            owner_name: values.ownerName,
            city: values.city || null,
            state: values.state || null,
            primary_language: values.primaryLanguage === "Kannada" ? "kn" : values.primaryLanguage === "Hindi" ? "hi" : "en"
          });
          if (error) throw new Error(error.message);
          const { error: activationError } = await supabase.rpc("activate_raw_catalog_for_tenant", { target_tenant: tenantId });
          if (activationError) throw new Error(activationError.message);
          await loadSupabase();
          return;
        }
        setState((current) => ({ ...current, onboarding: values }));
      },
      resetDemo() {
        localStorage.removeItem(storageKey);
        setState({ ...initialState, loading: false });
      }
    };
  }, [state]);

  return <LocalStoreContext.Provider value={store}>{children}</LocalStoreContext.Provider>;
}

export function useLocalStore() {
  const value = useContext(LocalStoreContext);
  if (!value) throw new Error("useLocalStore must be used within LocalStoreProvider");
  return value;
}

export function productMatches(product: ProductCard, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = [product.display_name, product.shop_label, product.tenant_notes, product.brand_name, product.category_name, product.variant, ...(product.aliases ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  const terms = normalizedQuery.replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}
