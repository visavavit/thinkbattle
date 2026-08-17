drop index if exists public.topics_single_featured_idx;
create index if not exists topics_featured_idx on public.topics (is_featured) where is_featured;