alter table public.tenant_products
  add column if not exists tenant_label text,
  add column if not exists tenant_notes text;

create or replace view public.tenant_inventory
with (security_invoker = true)
as
select
  tp.id as tenant_product_id,
  tp.tenant_id,
  coalesce(nullif(tp.tenant_label, ''), mp.canonical_name, tp.custom_name) as display_name,
  coalesce(b.name, cb.name) as brand_name,
  coalesce(pc.display_name_en, cpc.display_name_en) as category_name,
  coalesce(mp.aliases, tp.custom_aliases, '{}') as aliases,
  coalesce(mp.variant, tp.custom_variant) as variant,
  tp.is_custom,
  tp.custom_review_status,
  tp.reorder_threshold,
  cs.on_hand,
  cs.last_movement_at,
  tp.archived_at,
  tp.tenant_label as shop_label,
  tp.tenant_notes,
  tp.opening_balance
from public.tenant_products tp
left join public.master_products mp on mp.id = tp.master_product_id
left join public.vehicle_models vm on vm.id = mp.vehicle_model_id
left join public.brands b on b.id = vm.brand_id
left join public.product_categories pc on pc.id = mp.category_id
left join public.brands cb on cb.id = tp.custom_brand_id
left join public.product_categories cpc on cpc.id = tp.custom_category_id
left join public.current_stock cs on cs.tenant_product_id = tp.id
where tp.archived_at is null;
