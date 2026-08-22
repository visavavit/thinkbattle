create unique index if not exists profiles_username_unique_real
  on public.profiles (lower(username))
  where is_synthetic = false;