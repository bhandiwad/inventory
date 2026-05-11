create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id),
  name text not null,
  slug text not null,
  year_range text,
  body_type text,
  aliases text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (brand_id, slug)
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  display_name_en text not null,
  display_name_kn text,
  display_name_hi text,
  icon text,
  description text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.master_products (
  id uuid primary key default gen_random_uuid(),
  vehicle_model_id uuid references public.vehicle_models(id),
  category_id uuid references public.product_categories(id),
  canonical_name text not null,
  aliases text[] default '{}',
  variant text,
  unit text default 'pcs',
  is_universal boolean default false,
  is_active boolean default true,
  search_text text default '',
  created_at timestamptz default now()
);

create table if not exists public.raw_catalog_rows (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  source_sheet text,
  source_row int,
  raw_brand text,
  raw_model text,
  raw_category text,
  raw_variant text,
  raw_name text,
  raw_qty text,
  normalized_status text default 'pending' check (normalized_status in ('pending','mapped','alias','duplicate','skipped')),
  mapped_master_product_id uuid references public.master_products(id),
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null,
  owner_name text,
  owner_phone text,
  primary_language text default 'en',
  city text,
  state text,
  gst_number text,
  settings jsonb default '{"allow_negative_stock": true}',
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  name text,
  language_preference text default 'en',
  is_platform_admin boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.tenant_memberships (
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('owner', 'staff', 'viewer')) not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.tenant_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  master_product_id uuid references public.master_products(id),
  is_custom boolean generated always as (master_product_id is null) stored,
  custom_brand_id uuid references public.brands(id),
  custom_vehicle_model_id uuid references public.vehicle_models(id),
  custom_category_id uuid references public.product_categories(id),
  custom_name text,
  custom_aliases text[] default '{}',
  custom_variant text,
  custom_review_status text default 'pending' check (custom_review_status in ('pending','approved','promoted','rejected')),
  promoted_to_master_id uuid references public.master_products(id),
  reorder_threshold numeric default 0,
  opening_balance numeric default 0,
  opening_balance_at timestamptz default now(),
  mrp numeric,
  cost_price numeric,
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  custom_search_text text default '',
  created_at timestamptz default now(),
  unique (tenant_id, master_product_id),
  check (
    (master_product_id is not null and custom_name is null) or
    (master_product_id is null and custom_name is not null)
  )
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  tenant_product_id uuid references public.tenant_products(id),
  qty numeric not null,
  type text check (type in ('purchase','sale','adjustment','return','damage')) not null,
  source text check (source in ('manual','voice','chat','import')) not null default 'manual',
  reverses_transaction_id uuid references public.transactions(id),
  user_id uuid references public.profiles(id),
  occurred_at timestamptz default now(),
  notes text,
  voice_log_id uuid,
  client_mutation_id uuid not null,
  device_id text,
  created_offline boolean default false,
  created_at timestamptz default now(),
  unique (tenant_id, client_mutation_id)
);

create table if not exists public.voice_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  audio_url text,
  raw_transcript text,
  language_detected text,
  parsed_intent jsonb,
  candidate_tenant_product_ids uuid[],
  matched_tenant_product_id uuid references public.tenant_products(id),
  was_confirmed boolean default false,
  latency_ms int,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_voice_log_id_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_voice_log_id_fkey foreign key (voice_log_id) references public.voice_logs(id);
  end if;
end;
$$;

create or replace view public.current_stock as
  select
    tp.id as tenant_product_id,
    tp.tenant_id,
    tp.opening_balance + coalesce(sum(t.qty), 0) as on_hand,
    max(t.occurred_at) as last_movement_at
  from public.tenant_products tp
  left join public.transactions t on t.tenant_product_id = tp.id
  where tp.archived_at is null
  group by tp.id, tp.tenant_id, tp.opening_balance;

create index if not exists idx_vehicle_models_brand_id on public.vehicle_models(brand_id);
create index if not exists idx_vehicle_models_name_trgm on public.vehicle_models using gin (name gin_trgm_ops);
create index if not exists idx_master_products_vehicle_model_id on public.master_products(vehicle_model_id);
create index if not exists idx_master_products_category_id on public.master_products(category_id);
create index if not exists idx_master_products_search_trgm on public.master_products using gin (search_text gin_trgm_ops);
create index if not exists idx_tenant_products_tenant_id on public.tenant_products(tenant_id);
create index if not exists idx_tenant_products_master_product_id on public.tenant_products(master_product_id);
create index if not exists idx_tenant_products_custom_search_trgm on public.tenant_products using gin (custom_search_text gin_trgm_ops);
create index if not exists idx_transactions_tenant_product_id on public.transactions(tenant_product_id);
create index if not exists idx_transactions_tenant_occurred_at on public.transactions(tenant_id, occurred_at desc);
create index if not exists idx_tenant_memberships_user_id on public.tenant_memberships(user_id);
create index if not exists idx_raw_catalog_rows_status on public.raw_catalog_rows(normalized_status);

create or replace function public.refresh_master_product_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := lower(coalesce(new.canonical_name, '') || ' ' || coalesce(new.variant, '') || ' ' || array_to_string(coalesce(new.aliases, '{}'), ' '));
  return new;
end;
$$;

create or replace function public.refresh_tenant_product_custom_search_text()
returns trigger
language plpgsql
as $$
begin
  new.custom_search_text := lower(coalesce(new.custom_name, '') || ' ' || coalesce(new.custom_variant, '') || ' ' || array_to_string(coalesce(new.custom_aliases, '{}'), ' '));
  return new;
end;
$$;

drop trigger if exists master_products_refresh_search_text on public.master_products;
create trigger master_products_refresh_search_text
before insert or update of canonical_name, variant, aliases on public.master_products
for each row execute function public.refresh_master_product_search_text();

drop trigger if exists tenant_products_refresh_custom_search_text on public.tenant_products;
create trigger tenant_products_refresh_custom_search_text
before insert or update of custom_name, custom_variant, custom_aliases on public.tenant_products
for each row execute function public.refresh_tenant_product_custom_search_text();

create or replace function public.is_tenant_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = target
      and tm.user_id = auth.uid()
      and tm.is_active
  );
$$;

create or replace function public.has_tenant_role(target uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = target
      and tm.user_id = auth.uid()
      and tm.is_active
      and tm.role = any(roles)
  );
$$;

create or replace function public.can_read_tenant(target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target, array['owner','staff','viewer']);
$$;

create or replace function public.can_write_stock(target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target, array['owner','staff']);
$$;

create or replace function public.can_adjust_stock(target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target, array['owner']);
$$;

create or replace function public.can_manage_tenant(target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target, array['owner']);
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.prevent_sole_owner_loss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_owner_count int;
begin
  if old.role = 'owner' and old.is_active and old.user_id = auth.uid()
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.is_active) then
    select count(*) into active_owner_count
    from public.tenant_memberships
    where tenant_id = old.tenant_id and role = 'owner' and is_active;

    if active_owner_count <= 1 then
      raise exception 'sole_owner_cannot_remove_or_demote_self' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger tenant_memberships_prevent_sole_owner_loss
before update or delete on public.tenant_memberships
for each row execute function public.prevent_sole_owner_loss();

create or replace function public.validate_transaction_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  if new.user_id <> auth.uid() then
    raise exception 'transaction_user_must_match_authenticated_user' using errcode = '42501';
  end if;
  if new.type in ('purchase','sale') and not public.can_write_stock(new.tenant_id) then
    raise exception 'insufficient_stock_write_role' using errcode = '42501';
  end if;
  if new.type in ('adjustment','return','damage') and not public.can_adjust_stock(new.tenant_id) then
    raise exception 'insufficient_adjust_role' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tenant_products tp
    where tp.id = new.tenant_product_id and tp.tenant_id = new.tenant_id
  ) then
    raise exception 'tenant_product_not_in_tenant' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger transactions_validate_insert
before insert on public.transactions
for each row execute function public.validate_transaction_insert();

create or replace function public.search_tenant_products(target_tenant uuid, q text, limit_count int default 20)
returns table (
  tenant_product_id uuid,
  display_name text,
  category_name text,
  brand_name text,
  similarity_score real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tp.id,
    coalesce(mp.canonical_name, tp.custom_name) as display_name,
    pc.display_name_en,
    b.name,
    greatest(
      similarity(coalesce(mp.search_text, ''), lower(q)),
      similarity(coalesce(tp.custom_search_text, ''), lower(q)),
      similarity(coalesce(vm.name, ''), q),
      similarity(coalesce(b.name, ''), q)
    ) as similarity_score
  from public.tenant_products tp
  left join public.master_products mp on mp.id = tp.master_product_id
  left join public.vehicle_models vm on vm.id = coalesce(mp.vehicle_model_id, tp.custom_vehicle_model_id)
  left join public.brands b on b.id = coalesce(vm.brand_id, tp.custom_brand_id)
  left join public.product_categories pc on pc.id = coalesce(mp.category_id, tp.custom_category_id)
  where tp.tenant_id = target_tenant
    and tp.archived_at is null
    and public.can_read_tenant(target_tenant)
    and (
      coalesce(mp.search_text, '') % lower(q)
      or coalesce(tp.custom_search_text, '') % lower(q)
      or coalesce(vm.name, '') % q
      or coalesce(b.name, '') % q
      or lower(coalesce(mp.canonical_name, tp.custom_name, '')) like '%' || lower(q) || '%'
    )
  order by similarity_score desc, display_name
  limit limit_count;
$$;

alter table public.brands enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.product_categories enable row level security;
alter table public.master_products enable row level security;
alter table public.raw_catalog_rows enable row level security;
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_products enable row level security;
alter table public.transactions enable row level security;
alter table public.voice_logs enable row level security;

create policy "authenticated can read active brands" on public.brands for select to authenticated using (true);
create policy "platform admins manage brands" on public.brands for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "authenticated can read vehicle models" on public.vehicle_models for select to authenticated using (true);
create policy "platform admins manage vehicle models" on public.vehicle_models for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "authenticated can read categories" on public.product_categories for select to authenticated using (true);
create policy "platform admins manage categories" on public.product_categories for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "authenticated can read master products" on public.master_products for select to authenticated using (true);
create policy "platform admins manage master products" on public.master_products for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins manage raw catalog" on public.raw_catalog_rows for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "members read tenants" on public.tenants for select to authenticated using (public.can_read_tenant(id));
create policy "authenticated create tenant" on public.tenants for insert to authenticated with check (true);
create policy "owners update tenants" on public.tenants for update to authenticated using (public.can_manage_tenant(id)) with check (public.can_manage_tenant(id));

create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_platform_admin());
create policy "users insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and is_platform_admin = (select is_platform_admin from public.profiles where id = auth.uid()));

create policy "members read memberships in tenant" on public.tenant_memberships for select to authenticated using (public.can_read_tenant(tenant_id));
create policy "owners manage memberships" on public.tenant_memberships for all to authenticated using (public.can_manage_tenant(tenant_id)) with check (public.can_manage_tenant(tenant_id));
create policy "authenticated create first owner membership" on public.tenant_memberships for insert to authenticated with check (
  user_id = auth.uid()
  and role = 'owner'
  and not exists (select 1 from public.tenant_memberships tm where tm.tenant_id = tenant_id)
);

create policy "members read tenant products" on public.tenant_products for select to authenticated using (public.can_read_tenant(tenant_id));
create policy "owners and staff create tenant products" on public.tenant_products for insert to authenticated with check (
  public.can_write_stock(tenant_id)
  and created_by = auth.uid()
  and (master_product_id is not null or custom_name is not null)
);
create policy "owners manage tenant products" on public.tenant_products for update to authenticated using (public.can_manage_tenant(tenant_id)) with check (public.can_manage_tenant(tenant_id));

create policy "members read transactions" on public.transactions for select to authenticated using (public.can_read_tenant(tenant_id));
create policy "stock writers insert purchase sale" on public.transactions for insert to authenticated with check (
  type in ('purchase','sale') and public.can_write_stock(tenant_id) and user_id = auth.uid()
);
create policy "owners insert adjustments" on public.transactions for insert to authenticated with check (
  type in ('adjustment','return','damage') and public.can_adjust_stock(tenant_id) and user_id = auth.uid()
);

create policy "members read voice logs" on public.voice_logs for select to authenticated using (public.can_read_tenant(tenant_id));
create policy "stock writers create voice logs" on public.voice_logs for insert to authenticated with check (public.can_write_stock(tenant_id));
create policy "stock writers update own voice confirmations" on public.voice_logs for update to authenticated using (public.can_write_stock(tenant_id)) with check (public.can_write_stock(tenant_id));
