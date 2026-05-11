create or replace view public.tenant_inventory
with (security_invoker = true)
as
select
  tp.id as tenant_product_id,
  tp.tenant_id,
  coalesce(mp.canonical_name, tp.custom_name) as display_name,
  coalesce(b.name, cb.name) as brand_name,
  coalesce(pc.display_name_en, cpc.display_name_en) as category_name,
  coalesce(mp.aliases, tp.custom_aliases, '{}') as aliases,
  coalesce(mp.variant, tp.custom_variant) as variant,
  tp.is_custom,
  tp.custom_review_status,
  tp.reorder_threshold,
  cs.on_hand,
  cs.last_movement_at,
  tp.archived_at
from public.tenant_products tp
left join public.master_products mp on mp.id = tp.master_product_id
left join public.vehicle_models vm on vm.id = mp.vehicle_model_id
left join public.brands b on b.id = vm.brand_id
left join public.product_categories pc on pc.id = mp.category_id
left join public.brands cb on cb.id = tp.custom_brand_id
left join public.product_categories cpc on cpc.id = tp.custom_category_id
left join public.current_stock cs on cs.tenant_product_id = tp.id
where tp.archived_at is null;

create or replace function public.create_tenant_with_owner(
  shop_name text,
  owner_name text,
  city text default null,
  state text default null,
  primary_language text default 'en'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  insert into public.profiles (id, phone, name, language_preference)
  values (
    auth.uid(),
    nullif(auth.jwt() ->> 'phone', ''),
    owner_name,
    primary_language
  )
  on conflict (id) do update
  set name = excluded.name,
      language_preference = excluded.language_preference,
      phone = coalesce(public.profiles.phone, excluded.phone);

  insert into public.tenants (shop_name, owner_name, owner_phone, city, state, primary_language)
  values (shop_name, owner_name, nullif(auth.jwt() ->> 'phone', ''), city, state, primary_language)
  returning id into tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
  values (tenant_id, auth.uid(), 'owner', true);

  return tenant_id;
end;
$$;

create or replace function public.activate_master_products(
  target_tenant uuid,
  target_brand_names text[] default null,
  target_category_codes text[] default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  if not public.can_manage_tenant(target_tenant) then
    raise exception 'insufficient_tenant_role' using errcode = '42501';
  end if;

  insert into public.tenant_products (tenant_id, master_product_id, created_by)
  select target_tenant, mp.id, auth.uid()
  from public.master_products mp
  left join public.vehicle_models vm on vm.id = mp.vehicle_model_id
  left join public.brands b on b.id = vm.brand_id
  left join public.product_categories pc on pc.id = mp.category_id
  where mp.is_active
    and (target_brand_names is null or b.name = any(target_brand_names) or mp.is_universal)
    and (target_category_codes is null or pc.code = any(target_category_codes))
  on conflict (tenant_id, master_product_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.create_custom_tenant_product(
  target_tenant uuid,
  product_name text,
  brand_name text,
  category_code text,
  variant text default null,
  aliases text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  product_id uuid;
  brand_id uuid;
  category_id uuid;
begin
  if not public.can_write_stock(target_tenant) then
    raise exception 'insufficient_stock_write_role' using errcode = '42501';
  end if;

  select id into brand_id from public.brands where lower(name) = lower(brand_name) limit 1;
  if brand_id is null then
    select id into brand_id from public.brands where slug = 'universal-generic' limit 1;
  end if;

  select id into category_id from public.product_categories where code = category_code limit 1;
  if category_id is null then
    raise exception 'unknown_category_code' using errcode = '23503';
  end if;

  insert into public.tenant_products (
    tenant_id,
    custom_brand_id,
    custom_category_id,
    custom_name,
    custom_aliases,
    custom_variant,
    created_by
  )
  values (
    target_tenant,
    brand_id,
    category_id,
    product_name,
    aliases,
    variant,
    auth.uid()
  )
  returning id into product_id;

  return product_id;
end;
$$;

grant execute on function public.create_tenant_with_owner(text, text, text, text, text) to authenticated;
grant execute on function public.activate_master_products(uuid, text[], text[]) to authenticated;
grant execute on function public.create_custom_tenant_product(uuid, text, text, text, text, text[]) to authenticated;
