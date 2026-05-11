create or replace function public.accept_pending_tenant_invites(user_phone text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.profiles (id, phone, name)
  values (auth.uid(), user_phone, user_phone)
  on conflict (id) do update
  set phone = coalesce(public.profiles.phone, excluded.phone);

  insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
  select invite.tenant_id, auth.uid(), invite.role, true
  from public.tenant_member_invites invite
  where invite.phone = user_phone
    and invite.is_active = true
  on conflict (tenant_id, user_id) do update
  set role = excluded.role,
      is_active = true;

  get diagnostics accepted_count = row_count;

  update public.tenant_member_invites
  set accepted_user_id = auth.uid()
  where phone = user_phone
    and is_active = true;

  return accepted_count;
end;
$$;

grant execute on function public.accept_pending_tenant_invites(text) to authenticated;
