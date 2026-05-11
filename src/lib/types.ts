export type TenantRole = "owner" | "staff" | "viewer";
export type TransactionType = "purchase" | "sale" | "adjustment" | "return" | "damage";

export type ProductCard = {
  tenant_product_id: string;
  display_name: string;
  shop_label?: string | null;
  tenant_notes?: string | null;
  category_name: string | null;
  brand_name: string | null;
  aliases?: string[];
  variant?: string | null;
  is_custom?: boolean;
  on_hand?: number | null;
  opening_balance?: number | null;
  last_movement_at?: string | null;
  custom_review_status?: "pending" | "approved" | "promoted" | "rejected" | null;
  reorder_threshold?: number | null;
};

export type InventoryTransaction = {
  id: string;
  tenant_id: string;
  tenant_product_id: string;
  product_name: string;
  qty: number;
  type: TransactionType;
  source: "manual" | "voice" | "chat" | "import";
  user_name: string;
  occurred_at: string;
  notes?: string;
  reverses_transaction_id?: string;
  created_offline?: boolean;
};

export type VoiceIntent = {
  transcript: string;
  qty: number;
  type: TransactionType;
  language?: string;
};

export type CommandSource = "voice" | "chat";

export type VoiceCandidate = {
  product: ProductCard;
  score: number;
};

export type VoiceLog = {
  id: string;
  tenant_id: string;
  audio_url?: string | null;
  raw_transcript?: string | null;
  language_detected?: string | null;
  parsed_intent?: {
    qty?: number;
    type?: TransactionType;
    transcript?: string;
  } | null;
  candidate_tenant_product_ids?: string[] | null;
  matched_tenant_product_id?: string | null;
  was_confirmed?: boolean | null;
  latency_ms?: number | null;
  created_at: string;
};

export type TenantUser = {
  id: string;
  name: string;
  phone: string;
  role: TenantRole;
  is_active: boolean;
};

export type QueuedMutation = {
  client_mutation_id: string;
  tenant_id: string;
  tenant_product_id: string;
  qty: number;
  type: TransactionType;
  source: "manual" | "voice" | "chat" | "import";
  notes?: string;
  created_at: string;
  device_id: string;
};
