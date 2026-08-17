create or replace function public.admin_toggle_featured(_topic_id uuid, _on boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  featured_count integer;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  if _on then
    select count(*) into featured_count
      from public.topics
     where is_featured and id <> _topic_id;
    if featured_count >= 8 then
      raise exception 'You can pin at most 8 headliners.' using errcode = 'P0001';
    end if;
    update public.topics
       set is_featured = true
     where id = _topic_id and status = 'published';
  else
    update public.topics
       set is_featured = false
     where id = _topic_id;
  end if;
end; $$;

revoke all on function public.admin_toggle_featured(uuid, boolean) from public, anon;
grant execute on function public.admin_toggle_featured(uuid, boolean) to authenticated;