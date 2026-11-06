-- Maestro Academy: accounts, plans and payments. Designed to stay tiny: one row per person.
-- Progress is one JSON document per person (typically 10-50 KB).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin', 'teacher')),
  -- Paid access: Pro while pro_until is in the future, Plus (everything) while plus_until is. Admin = everything.
  pro_until timestamptz,
  plus_until timestamptz,
  pro_source text check (pro_source in ('stripe', 'monime', 'flot', 'grant')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  stripe_status text,
  stripe_tier text,               -- pro | plus: which price the card subscription is on
  progress jsonb not null default '{}'::jsonb,
  progress_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  provider text not null check (provider in ('stripe', 'monime', 'flot', 'grant')),
  external_id text not null,
  plan text not null,             -- pro | plus | pass_pro | pass_plus | grant_pro | grant_plus
  amount_minor bigint,
  currency text,
  days_added int,
  created_at timestamptz not null default now(),
  unique (provider, external_id)  -- webhooks may retry: never credit twice
);

-- Admin emails get the admin role automatically on first sign-in.
create table if not exists public.admin_emails (email text primary key);
insert into public.admin_emails (email) values ('meesheiksm@gmail.com') on conflict do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (new.id, lower(new.email),
          nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), ''),
          case when exists (select 1 from public.admin_emails a where a.email = lower(new.email)) then 'admin' else 'user' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Extend Pro or Plus by N days from max(now, current end). Used by Monime and admin grants.
create or replace function public.extend_pro(p_user uuid, p_days int, p_source text, p_tier text default 'pro') returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  if p_tier = 'plus' then
    update public.profiles
       set plus_until = greatest(coalesce(plus_until, now()), now()) + make_interval(days => p_days), pro_source = p_source
     where id = p_user returning plus_until into t;
  else
    update public.profiles
       set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => p_days), pro_source = p_source
     where id = p_user returning pro_until into t;
  end if;
  return t;
end $$;
revoke all on function public.extend_pro(uuid, int, text, text) from public, anon, authenticated;

-- Row level security: people read their own row and may only update their own progress/name.
alter table public.profiles enable row level security;
alter table public.payments enable row level security;
alter table public.admin_emails enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());

drop policy if exists "admin updates profiles" on public.profiles;
create policy "admin updates profiles" on public.profiles for update using (public.is_admin());

drop policy if exists "read own payments" on public.payments;
create policy "read own payments" on public.payments for select using (user_id = auth.uid() or public.is_admin());

-- Users never update plan columns directly: progress goes through this function only.
create or replace function public.save_progress(p jsonb) returns timestamptz
language sql security definer set search_path = public as $$
  update public.profiles set progress = p, progress_updated_at = now() where id = auth.uid() returning progress_updated_at;
$$;
grant execute on function public.save_progress(jsonb) to authenticated;

create or replace function public.set_display_name(n text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set display_name = left(n, 60) where id = auth.uid();
$$;
grant execute on function public.set_display_name(text) to authenticated;

-- Admin: grant or remove Pro days, change roles (checked inside).
create or replace function public.admin_grant(p_email text, p_days int, p_tier text default 'pro') returns timestamptz
language plpgsql security definer set search_path = public as $$
declare uid uuid; t timestamptz;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select id into uid from public.profiles where email = lower(p_email);
  if uid is null then raise exception 'no account with that email yet (they must sign in once)'; end if;
  if p_days <= 0 then
    update public.profiles set pro_until = now(), plus_until = now(), pro_source = 'grant' where id = uid returning pro_until into t;
  else
    t := public.extend_pro(uid, p_days, 'grant', p_tier);
  end if;
  insert into public.payments (user_id, provider, external_id, plan, days_added)
  values (uid, 'grant', gen_random_uuid()::text, case when p_days <= 0 then 'remove' else 'grant_' || p_tier end, p_days);
  return t;
end $$;
grant execute on function public.admin_grant(text, int, text) to authenticated;

create or replace function public.admin_set_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.profiles set role = p_role where email = lower(p_email);
end $$;
grant execute on function public.admin_set_role(text, text) to authenticated;
