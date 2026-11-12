-- People: an opt-in public card per learner. Only what is on the card is shared; email, plan and the
-- full progress document stay private in public.profiles.

create table if not exists public.public_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  headline text check (char_length(headline) <= 80),
  location text check (char_length(location) <= 40),
  link_url text check (link_url is null or (link_url ~* '^https://[^ ]+$' and char_length(link_url) <= 300)),
  link_label text check (char_length(link_label) <= 24),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  cover text not null default 'forest' check (cover in ('forest', 'keys', 'dusk', 'stage', 'paper', 'night')),
  plays text[] not null default '{piano}',
  visible boolean not null default true,
  -- small summary written by the app when progress syncs: level, lessons done, streak, minutes, per-level done/total
  stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 4000),
  joined_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists public_profiles_visible on public.public_profiles (visible, updated_at desc);

-- the join date always comes from the account, never from the client
create or replace function public.public_profile_defaults() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.joined_at := (select created_at from public.profiles where id = new.id);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists public_profile_defaults on public.public_profiles;
create trigger public_profile_defaults before insert or update on public.public_profiles for each row execute function public.public_profile_defaults();

alter table public.public_profiles enable row level security;
drop policy if exists "signed-in people see visible cards" on public.public_profiles;
create policy "signed-in people see visible cards" on public.public_profiles for select to authenticated using (visible or id = auth.uid());
drop policy if exists "write own card" on public.public_profiles;
create policy "write own card" on public.public_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "update own card" on public.public_profiles;
create policy "update own card" on public.public_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "delete own card" on public.public_profiles;
create policy "delete own card" on public.public_profiles for delete to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "admin hides cards" on public.public_profiles;
create policy "admin hides cards" on public.public_profiles for update to authenticated using (public.is_admin());

-- profile photos: public to read, each person writes only inside their own folder (avatars/<user id>/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "avatar read" on storage.objects;
create policy "avatar read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatar write own" on storage.objects;
create policy "avatar write own" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar update own" on storage.objects;
create policy "avatar update own" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar delete own" on storage.objects;
create policy "avatar delete own" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
