create or replace function public.resolve_tag_names(_names text[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  _name text;
  _slug text;
  _id uuid;
  _ids uuid[] := '{}';
  _count int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add tags';
  end if;
  if public.is_banned(auth.uid()) then
    raise exception 'Your account cannot add tags';
  end if;

  foreach _name in array coalesce(_names, '{}')
  loop
    _name := btrim(regexp_replace(_name, '\s+', ' ', 'g'));
    continue when _name = '';
    if length(_name) > 24 then
      _name := left(_name, 24);
    end if;
    _slug := regexp_replace(lower(_name), '[^a-z0-9\u0e00-\u0e7f]+', '-', 'g');
    _slug := btrim(_slug, '-');
    continue when _slug = '';

    _count := _count + 1;
    if _count > 6 then
      raise exception 'You can add up to 6 tags';
    end if;

    select id into _id from public.tags where slug = _slug limit 1;
    if _id is null then
      insert into public.tags (name, slug) values (_name, _slug)
      on conflict (slug) do update set name = public.tags.name
      returning id into _id;
    end if;

    if not (_id = any(_ids)) then
      _ids := _ids || _id;
    end if;
  end loop;

  return _ids;
end;
$$;

create unique index if not exists tags_slug_key on public.tags (slug);

revoke all on function public.resolve_tag_names(text[]) from public;
grant execute on function public.resolve_tag_names(text[]) to authenticated;