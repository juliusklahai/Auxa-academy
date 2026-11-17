-- 0012: news from Auxa. The admin posts short announcements; the app shows them in its news panel, and
-- the Android app checks for new ones in the background and shows each once as a notification.
-- Public to read (they are announcements), only admins write. Safe to run again.

create table if not exists public.announcements (
  id bigserial primary key,
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 400),
  published boolean not null default true,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "anyone reads published news" on public.announcements;
create policy "anyone reads published news" on public.announcements for select to anon, authenticated using (published or public.is_admin());
drop policy if exists "admins write news" on public.announcements;
create policy "admins write news" on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant usage, select on sequence public.announcements_id_seq to authenticated;

notify pgrst, 'reload schema';
