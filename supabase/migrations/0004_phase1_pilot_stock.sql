create table if not exists public.tenant_member_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  phone text not null,
  role text check (role in ('owner', 'staff', 'viewer')) not null,
  invited_by uuid references public.profiles(id),
  accepted_user_id uuid references public.profiles(id),
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (tenant_id, phone)
);

alter table public.tenant_member_invites enable row level security;

drop policy if exists "owners manage tenant invites" on public.tenant_member_invites;
create policy "owners manage tenant invites" on public.tenant_member_invites
for all to authenticated
using (public.can_manage_tenant(tenant_id))
with check (public.can_manage_tenant(tenant_id));

drop policy if exists "members read tenant invites" on public.tenant_member_invites;
create policy "members read tenant invites" on public.tenant_member_invites
for select to authenticated
using (public.can_read_tenant(tenant_id));

drop policy if exists "members read profiles in their tenants" on public.profiles;
create policy "members read profiles in their tenants" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_platform_admin()
  or exists (
    select 1
    from public.tenant_memberships mine
    join public.tenant_memberships other_membership
      on other_membership.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid()
      and mine.is_active
      and other_membership.user_id = profiles.id
      and other_membership.is_active
  )
);

create or replace function public.activate_raw_catalog_for_tenant(target_tenant uuid)
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

  insert into public.tenant_products (
    tenant_id,
    custom_brand_id,
    custom_category_id,
    custom_name,
    custom_aliases,
    opening_balance,
    created_by,
    custom_review_status
  )
  select
    target_tenant,
    b.id,
    pc.id,
    r.raw_name,
    array_remove(array[r.raw_name, r.raw_model, r.source_sheet], null),
    case
      when coalesce(r.raw_qty, '') ~ '^-?[0-9]+(\.[0-9]+)?$' then r.raw_qty::numeric
      else 0
    end,
    auth.uid(),
    'pending'
  from public.raw_catalog_rows r
  left join public.brands b on b.slug = r.raw_brand
  left join public.product_categories pc on pc.code = r.raw_category
  where r.raw_name is not null
    and b.id is not null
    and pc.id is not null
    and not exists (
      select 1
      from public.tenant_products tp
      where tp.tenant_id = target_tenant
        and tp.master_product_id is null
        and lower(tp.custom_name) = lower(r.raw_name)
        and tp.custom_category_id = pc.id
        and tp.custom_brand_id = b.id
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.invite_tenant_member(target_tenant uuid, target_phone text, target_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_id uuid;
  existing_user uuid;
begin
  if not public.can_manage_tenant(target_tenant) then
    raise exception 'insufficient_tenant_role' using errcode = '42501';
  end if;

  if target_role not in ('owner', 'staff', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select id into existing_user
  from public.profiles
  where phone = target_phone
  limit 1;

  insert into public.tenant_member_invites (tenant_id, phone, role, invited_by, accepted_user_id)
  values (target_tenant, target_phone, target_role, auth.uid(), existing_user)
  on conflict (tenant_id, phone) do update
  set role = excluded.role,
      is_active = true,
      accepted_user_id = excluded.accepted_user_id
  returning id into invite_id;

  if existing_user is not null then
    insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
    values (target_tenant, existing_user, target_role, true)
    on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        is_active = true;
  end if;

  return invite_id;
end;
$$;

grant execute on function public.activate_raw_catalog_for_tenant(uuid) to authenticated;
grant execute on function public.invite_tenant_member(uuid, text, text) to authenticated;
