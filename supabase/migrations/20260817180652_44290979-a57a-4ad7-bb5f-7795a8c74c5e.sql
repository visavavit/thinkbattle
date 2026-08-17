ALTER TABLE public.comments
  ADD COLUMN parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX comments_parent_id_idx ON public.comments(parent_id);

CREATE OR REPLACE FUNCTION public.guard_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare p record;
begin
  if new.parent_id is null then
    return new;
  end if;
  select id, topic_id, parent_id into p from public.comments where id = new.parent_id;
  if p.id is null then
    raise exception 'That comment no longer exists.' using errcode = '22000';
  end if;
  if p.parent_id is not null then
    raise exception 'You can only reply to a top-level take.' using errcode = '22000';
  end if;
  if p.topic_id <> new.topic_id then
    raise exception 'Reply must stay on the same topic.' using errcode = '22000';
  end if;
  return new;
end; $$;

CREATE TRIGGER comments_guard_reply
  BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_comment_reply();

CREATE POLICY "reply after voting"
ON public.comments FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT is_banned(auth.uid())
  AND parent_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.votes v
    WHERE v.topic_id = comments.topic_id AND v.user_id = auth.uid()
  )
);