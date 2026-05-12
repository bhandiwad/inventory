create or replace function public.get_inventory_movement_report(
  target_tenant uuid,
  from_date date,
  to_date date,
  report_month text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date;
  month_end date;
  result jsonb;
begin
  if not public.can_read_tenant(target_tenant) then
    raise exception 'insufficient_tenant_read_role' using errcode = '42501';
  end if;

  if from_date is null or to_date is null or from_date > to_date then
    raise exception 'invalid_report_range' using errcode = '22007';
  end if;

  month_start := coalesce(pg_catalog.to_date(report_month || '-01', 'YYYY-MM-DD'), date_trunc('month', current_date)::date);
  month_end := (month_start + interval '1 month - 1 day')::date;

  with product_names as (
    select tenant_product_id, display_name, brand_name, category_name
    from public.tenant_inventory
    where tenant_id = target_tenant
  ),
  scoped as (
    select t.*, pn.display_name, pn.brand_name, pn.category_name
    from public.transactions t
    left join product_names pn on pn.tenant_product_id = t.tenant_product_id
    where t.tenant_id = target_tenant
      and t.occurred_at::date between from_date and to_date
  ),
  monthly as (
    select t.*, pn.display_name, pn.brand_name, pn.category_name
    from public.transactions t
    left join product_names pn on pn.tenant_product_id = t.tenant_product_id
    where t.tenant_id = target_tenant
      and t.occurred_at::date between month_start and month_end
  ),
  summary as (
    select jsonb_build_object(
      'sold', coalesce(sum(abs(qty)) filter (where qty < 0), 0),
      'added', coalesce(sum(qty) filter (where qty > 0), 0),
      'net', coalesce(sum(qty), 0),
      'count', count(*),
      'products', count(distinct tenant_product_id),
      'returns', coalesce(sum(abs(qty)) filter (where type = 'return'), 0),
      'damaged', coalesce(sum(abs(qty)) filter (where type = 'damage'), 0),
      'adjustments', coalesce(sum(abs(qty)) filter (where type = 'adjustment'), 0)
    ) as data
    from scoped
  ),
  month_summary as (
    select jsonb_build_object(
      'sold', coalesce(sum(abs(qty)) filter (where qty < 0), 0),
      'added', coalesce(sum(qty) filter (where qty > 0), 0),
      'net', coalesce(sum(qty), 0),
      'count', count(*),
      'products', count(distinct tenant_product_id),
      'returns', coalesce(sum(abs(qty)) filter (where type = 'return'), 0),
      'damaged', coalesce(sum(abs(qty)) filter (where type = 'damage'), 0),
      'adjustments', coalesce(sum(abs(qty)) filter (where type = 'adjustment'), 0)
    ) as data
    from monthly
  ),
  daily as (
    select coalesce(jsonb_agg(row_to_json(row_data)::jsonb order by day desc), '[]'::jsonb) as data
    from (
      select
        occurred_at::date::text as day,
        coalesce(sum(abs(qty)) filter (where qty < 0), 0) as sold,
        coalesce(sum(qty) filter (where qty > 0), 0) as added,
        coalesce(sum(qty), 0) as net,
        count(*) as count
      from scoped
      group by occurred_at::date
    ) row_data
  ),
  products as (
    select coalesce(jsonb_agg(row_to_json(row_data)::jsonb order by movement desc), '[]'::jsonb) as data
    from (
      select
        tenant_product_id,
        coalesce(display_name, 'Product') as name,
        brand_name as brand,
        category_name as category,
        coalesce(sum(abs(qty)) filter (where qty < 0), 0) as sold,
        coalesce(sum(qty) filter (where qty > 0), 0) as added,
        coalesce(sum(abs(qty)), 0) as movement,
        coalesce(sum(qty), 0) as net
      from scoped
      group by tenant_product_id, display_name, brand_name, category_name
      order by movement desc
      limit 20
    ) row_data
  ),
  categories as (
    select coalesce(jsonb_agg(row_to_json(row_data)::jsonb order by movement desc), '[]'::jsonb) as data
    from (
      select
        coalesce(category_name, 'Uncategorized') as name,
        coalesce(sum(abs(qty)) filter (where qty < 0), 0) as sold,
        coalesce(sum(qty) filter (where qty > 0), 0) as added,
        coalesce(sum(abs(qty)), 0) as movement
      from scoped
      group by coalesce(category_name, 'Uncategorized')
      order by movement desc
      limit 12
    ) row_data
  ),
  brands as (
    select coalesce(jsonb_agg(row_to_json(row_data)::jsonb order by movement desc), '[]'::jsonb) as data
    from (
      select
        coalesce(brand_name, 'Unknown') as name,
        coalesce(sum(abs(qty)) filter (where qty < 0), 0) as sold,
        coalesce(sum(qty) filter (where qty > 0), 0) as added,
        coalesce(sum(abs(qty)), 0) as movement
      from scoped
      group by coalesce(brand_name, 'Unknown')
      order by movement desc
      limit 12
    ) row_data
  )
  select jsonb_build_object(
    'summary', summary.data,
    'month', month_summary.data,
    'daily', daily.data,
    'products', products.data,
    'categories', categories.data,
    'brands', brands.data,
    'fromDate', from_date::text,
    'toDate', to_date::text,
    'reportMonth', to_char(month_start, 'YYYY-MM')
  )
  into result
  from summary, month_summary, daily, products, categories, brands;

  return result;
end;
$$;

create or replace function public.get_product_movement_report(
  target_tenant uuid,
  target_tenant_product uuid,
  from_date date default current_date - 30,
  to_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.can_read_tenant(target_tenant) then
    raise exception 'insufficient_tenant_read_role' using errcode = '42501';
  end if;

  with product_row as (
    select *
    from public.tenant_inventory
    where tenant_id = target_tenant
      and tenant_product_id = target_tenant_product
    limit 1
  ),
  scoped as (
    select *
    from public.transactions
    where tenant_id = target_tenant
      and tenant_product_id = target_tenant_product
      and occurred_at::date between from_date and to_date
    order by occurred_at desc
  ),
  summary as (
    select jsonb_build_object(
      'sold', coalesce(sum(abs(qty)) filter (where qty < 0), 0),
      'added', coalesce(sum(qty) filter (where qty > 0), 0),
      'net', coalesce(sum(qty), 0),
      'count', count(*),
      'lastMovementAt', max(occurred_at)
    ) as data
    from scoped
  ),
  movement as (
    select coalesce(jsonb_agg(row_to_json(row_data)::jsonb), '[]'::jsonb) as data
    from (
      select id, qty, type, source, occurred_at, notes, created_offline, reverses_transaction_id
      from scoped
      limit 200
    ) row_data
  )
  select jsonb_build_object(
    'product', row_to_json(product_row)::jsonb,
    'summary', summary.data,
    'movement', movement.data
  )
  into result
  from product_row, summary, movement;

  return coalesce(result, jsonb_build_object('product', null, 'summary', '{}'::jsonb, 'movement', '[]'::jsonb));
end;
$$;

create or replace function public.promote_custom_product_to_master(target_tenant_product uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_product public.tenant_products%rowtype;
  master_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  select * into tenant_product
  from public.tenant_products
  where id = target_tenant_product
    and master_product_id is null
  for update;

  if tenant_product.id is null then
    raise exception 'custom_product_not_found' using errcode = 'P0002';
  end if;

  insert into public.master_products (
    vehicle_model_id,
    category_id,
    canonical_name,
    aliases,
    variant,
    unit,
    is_universal,
    is_active
  )
  values (
    tenant_product.custom_vehicle_model_id,
    tenant_product.custom_category_id,
    tenant_product.custom_name,
    tenant_product.custom_aliases,
    tenant_product.custom_variant,
    'pcs',
    tenant_product.custom_vehicle_model_id is null,
    true
  )
  returning id into master_id;

  update public.tenant_products
  set master_product_id = master_id,
      promoted_to_master_id = master_id,
      custom_review_status = 'promoted'
  where id = target_tenant_product;

  return master_id;
end;
$$;

grant execute on function public.get_inventory_movement_report(uuid, date, date, text) to authenticated;
grant execute on function public.get_product_movement_report(uuid, uuid, date, date) to authenticated;
grant execute on function public.promote_custom_product_to_master(uuid) to authenticated;
