-- Verifiable certificates. Only the database can issue one: it checks the learner's synced progress,
-- gives the certificate a random code and a "seal" (an HMAC of its details with a secret key nobody can
-- read through the API). Anyone can verify a code; the seal drives the certificate's unique guilloche,
-- microtext and melody, so a forged or edited certificate cannot match the verify page.
-- Run once in the Supabase SQL editor.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.cert_key (id int primary key default 1 check (id = 1), k bytea not null);
insert into private.cert_key (k) select gen_random_bytes(32) where not exists (select 1 from private.cert_key);

create table if not exists public.certificates (
  code text primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  level int not null,
  level_name text not null,
  topics text not null default '',
  earned_on date not null,
  issued_at timestamptz not null default now(),
  seal text not null,
  replaced_by text,
  revoked boolean not null default false
);
create index if not exists certificates_user_level on public.certificates (user_id, level);
alter table public.certificates enable row level security;
-- learners can list their own; nobody writes directly (only through issue_certificate)
drop policy if exists "own certificates" on public.certificates;
create policy "own certificates" on public.certificates for select using (auth.uid() = user_id);

create or replace function public.issue_certificate(p_level int, p_name text, p_level_name text, p_topics text)
returns table (code text, seal text, issued_at timestamptz, earned_on date)
language plpgsql security definer set search_path = public, private, extensions as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  earned text;
  nm text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40);
  c public.certificates%rowtype;
  new_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  i int;
begin
  if uid is null then raise exception 'Please sign in to get a verifiable certificate.'; end if;
  if nm = '' then raise exception 'Please add the name for the certificate.'; end if;
  select p.progress -> 'certs' ->> p_level::text into earned from public.profiles p where p.id = uid;
  if earned is null then raise exception 'This level is not finished on your account yet. Open the app online so your progress syncs, then try again.'; end if;

  -- the same name again: give back the certificate already issued
  select * into c from public.certificates x where x.user_id = uid and x.level = p_level and x.name = nm and not x.revoked and x.replaced_by is null limit 1;
  if found then return query select c.code, c.seal, c.issued_at, c.earned_on; return; end if;

  loop
    b := gen_random_bytes(10); new_code := '';
    for i in 0..9 loop new_code := new_code || substr(alphabet, 1 + (get_byte(b, i) % 32), 1); end loop;
    new_code := 'AUX-' || substr(new_code, 1, 5) || '-' || substr(new_code, 6, 5);
    exit when not exists (select 1 from public.certificates x where x.code = new_code);
  end loop;

  insert into public.certificates (code, user_id, name, level, level_name, topics, earned_on, seal)
  values (new_code, uid, nm, p_level, left(coalesce(p_level_name, ''), 80), left(coalesce(p_topics, ''), 300), earned::date,
          encode(hmac(convert_to(new_code || '|' || uid::text || '|' || nm || '|' || p_level::text || '|' || earned, 'UTF8'), (select k from private.cert_key), 'sha256'), 'hex'))
  returning * into c;
  -- an older certificate for this level (another spelling of the name) now points to the new one
  update public.certificates x set replaced_by = c.code where x.user_id = uid and x.level = p_level and x.code <> c.code and x.replaced_by is null;
  return query select c.code, c.seal, c.issued_at, c.earned_on;
end $$;
grant execute on function public.issue_certificate(int, text, text, text) to authenticated;

-- public check: what the database says about a code (no account details, no email)
create or replace function public.verify_certificate(p_code text)
returns table (code text, name text, level int, level_name text, topics text, earned_on date, issued_at timestamptz, seal text, replaced_by text, revoked boolean)
language sql security definer set search_path = public as $$
  select c.code, c.name, c.level, c.level_name, c.topics, c.earned_on, c.issued_at, c.seal, c.replaced_by, c.revoked
  from public.certificates c where c.code = upper(btrim(p_code));
$$;
grant execute on function public.verify_certificate(text) to anon, authenticated;
