-- Server-witnessed progress. The app's own progress lives on the phone and can be edited by its owner, so
-- certificates no longer trust it. Instead the server witnesses each attempt:
--   1. When an exercise opens, start_attempt() gives a one-use ticket stamped with the server's clock.
--   2. When it finishes, finish_attempt() checks the ticket belongs to the caller, that enough real time has
--      passed to actually play it (from the exercise catalog), that the score clears the pass mark and that
--      enough notes were played, then records a verified pass on the server.
--   3. issue_certificate() seals a level only when every exercise in it has its verified passes.
-- Run after 0004-0007, then run 0009_exercise_catalog.sql (the generated list of exercises).

create schema if not exists private;

create table if not exists private.exercise_catalog (
  id text primary key,
  lesson_id text not null,
  level int not null,
  track text not null,
  piece boolean not null default false,   -- play-along piece: one per lesson is enough
  required_passes int not null default 1,
  pass_score int not null default 80,
  groups int not null default 1,          -- note groups (or drill rounds)
  min_ms int not null default 1500        -- the least real time a genuine attempt takes
);
create index if not exists exercise_catalog_level on private.exercise_catalog (level, track);

create table if not exists private.attempt_tickets (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  exercise_id text not null,
  started_at timestamptz not null default now()
);
create index if not exists attempt_tickets_user on private.attempt_tickets (user_id, started_at);

create table if not exists public.verified_passes (
  user_id uuid not null references auth.users on delete cascade,
  exercise_id text not null,
  best int not null default 0,
  passes int not null default 0,
  attempts int not null default 0,
  first_pass_at timestamptz,
  last_pass_at timestamptz,
  primary key (user_id, exercise_id)
);
alter table public.verified_passes enable row level security;
drop policy if exists "own verified passes" on public.verified_passes;
create policy "own verified passes" on public.verified_passes for select to authenticated using (user_id = auth.uid());
-- no insert/update/delete policies: only finish_attempt() writes here

create or replace function public.start_attempt(p_exercise text) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare uid uuid := auth.uid(); t uuid;
begin
  if uid is null then return null; end if;
  if not exists (select 1 from private.exercise_catalog where id = p_exercise) then return null; end if;
  delete from private.attempt_tickets where user_id = uid and (started_at < now() - interval '6 hours' or exercise_id = p_exercise);
  -- a handful of open tickets per person is plenty
  delete from private.attempt_tickets where token in (
    select token from private.attempt_tickets where user_id = uid order by started_at desc offset 20);
  insert into private.attempt_tickets (user_id, exercise_id) values (uid, p_exercise) returning token into t;
  return t;
end $$;

create or replace function public.finish_attempt(p_token uuid, p_score int, p_passed boolean, p_hits int) returns text
language plpgsql security definer set search_path = public, private as $$
declare uid uuid := auth.uid(); tk private.attempt_tickets%rowtype; c private.exercise_catalog%rowtype; ok boolean; sc int;
begin
  if uid is null then return 'signed out'; end if;
  delete from private.attempt_tickets where token = p_token and user_id = uid returning * into tk;  -- one use only
  if tk.token is null then return 'no ticket'; end if;
  select * into c from private.exercise_catalog where id = tk.exercise_id;
  if c.id is null then return 'unknown exercise'; end if;
  sc := greatest(0, least(100, coalesce(p_score, 0)));
  if now() - tk.started_at < make_interval(secs => c.min_ms / 1000.0) then
    ok := false;
  else
    ok := coalesce(p_passed, false) and sc >= c.pass_score and coalesce(p_hits, 0) >= ceil(c.groups * 0.6);
  end if;
  insert into public.verified_passes as v (user_id, exercise_id, best, passes, attempts, first_pass_at, last_pass_at)
  values (uid, c.id, case when ok then sc else 0 end, ok::int, 1, case when ok then now() end, case when ok then now() end)
  on conflict (user_id, exercise_id) do update set
    attempts = v.attempts + 1,
    best = case when ok then greatest(v.best, sc) else v.best end,
    passes = v.passes + ok::int,
    first_pass_at = coalesce(v.first_pass_at, case when ok then now() end),
    last_pass_at = case when ok then now() else v.last_pass_at end;
  return case when ok then 'verified' when now() - tk.started_at < make_interval(secs => c.min_ms / 1000.0) then 'too fast' else 'not passed' end;
end $$;

-- how many pieces of a level are still missing a verified pass (0 = the level is verified)
create or replace function public.level_missing(p_uid uuid, p_level int) returns int
language sql stable security definer set search_path = public, private as $$
  with ex as (
    select c.*, coalesce(v.passes, 0) >= c.required_passes as done
    from private.exercise_catalog c
    left join public.verified_passes v on v.user_id = p_uid and v.exercise_id = c.id
    where c.level = p_level and c.track = 'piano'
  )
  select (select count(*) from ex where not piece and not done)::int
       + (select count(*) from (select lesson_id from ex where piece group by lesson_id having not bool_or(done)) x)::int;
$$;

-- for the app: what still needs a verified pass in a level
create or replace function public.level_verification(p_level int) returns table (exercise_id text, lesson_id text, piece boolean, required int, passes int)
language sql stable security definer set search_path = public, private as $$
  select c.id, c.lesson_id, c.piece, c.required_passes, coalesce(v.passes, 0)
  from private.exercise_catalog c
  left join public.verified_passes v on v.user_id = auth.uid() and v.exercise_id = c.id
  where c.level = p_level and c.track = 'piano' and auth.uid() is not null
  order by c.lesson_id, c.id;
$$;

-- certificates now seal from verified passes. A level that already has a certificate on the account
-- (issued before verification existed) can still be re-issued, e.g. to fix the name.
create or replace function public.issue_certificate(p_level int, p_name text, p_level_name text, p_topics text)
returns table (code text, seal text, issued_at timestamptz, earned_on date)
language plpgsql security definer set search_path = public, private, extensions as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  earned text;
  missing int;
  nm text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40);
  lvl_name text := (array['Foundations', 'First notes and melodies', 'Right and left hand technique', 'Grand staff and both hands',
    'Rhythm', 'Keys and scales', 'Chords and accompaniment', 'Expression and touch', 'Sight-reading and intervals',
    'Advanced technique', 'Playing by ear', 'Jazz piano', 'Four-part writing and arranging', 'Church musician',
    'Styles: pop, blues, Latin, gospel, highlife'])[p_level + 1];
  c public.certificates%rowtype;
  new_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  i int;
begin
  if uid is null then raise exception 'Please sign in to get a verifiable certificate.'; end if;
  if p_level is null or p_level < 0 or p_level > 14 or lvl_name is null then raise exception 'Unknown level.'; end if;
  if nm = '' then raise exception 'Please add the name for the certificate.'; end if;
  if nm ~ '[<>]' then raise exception 'Please use only letters and normal punctuation in the name.'; end if;

  -- the same name again: give back the certificate already issued
  select * into c from public.certificates x where x.user_id = uid and x.level = p_level and x.name = nm and not x.revoked and x.replaced_by is null limit 1;
  if found then return query select c.code, c.seal, c.issued_at, c.earned_on; return; end if;

  -- earned: verified by the server, or a certificate already on the account (keeps its date)
  select x.earned_on::text into earned from public.certificates x where x.user_id = uid and x.level = p_level and not x.revoked order by x.issued_at limit 1;
  if earned is null then
    if not exists (select 1 from private.exercise_catalog k where k.level = p_level and k.track = 'piano') then
      raise exception 'Verified certificates are being set up. Please try again later.';
    end if;
    missing := public.level_missing(uid, p_level);
    if missing > 0 then
      raise exception 'VERIFY:% To seal this certificate, play the exercises still marked in this level again while signed in and online (% left). Your progress on this device is safe; this just lets Auxa witness it.', missing, missing;
    end if;
    select to_char(max(v.last_pass_at), 'YYYY-MM-DD') into earned
      from public.verified_passes v join private.exercise_catalog k on k.id = v.exercise_id
      where v.user_id = uid and k.level = p_level and k.track = 'piano';
    earned := coalesce(earned, to_char(now(), 'YYYY-MM-DD'));
  end if;
  if (select count(*) from public.certificates x where x.user_id = uid) >= 60 then raise exception 'Too many certificates on this account. Contact support.'; end if;

  loop
    b := gen_random_bytes(10); new_code := '';
    for i in 0..9 loop new_code := new_code || substr(alphabet, 1 + (get_byte(b, i) % 32), 1); end loop;
    new_code := 'AUX-' || substr(new_code, 1, 5) || '-' || substr(new_code, 6, 5);
    exit when not exists (select 1 from public.certificates x where x.code = new_code);
  end loop;

  insert into public.certificates (code, user_id, name, level, level_name, topics, earned_on, seal)
  values (new_code, uid, nm, p_level, lvl_name, left(coalesce(p_topics, ''), 300), earned::date,
          encode(hmac(convert_to(new_code || '|' || uid::text || '|' || nm || '|' || p_level::text || '|' || earned, 'UTF8'), (select k from private.cert_key), 'sha256'), 'hex'))
  returning * into c;
  update public.certificates x set replaced_by = c.code where x.user_id = uid and x.level = p_level and x.code <> c.code and x.replaced_by is null;
  return query select c.code, c.seal, c.issued_at, c.earned_on;
end $$;

-- who may run what
revoke all on function public.start_attempt(text) from public, anon;
revoke all on function public.finish_attempt(uuid, int, boolean, int) from public, anon;
revoke all on function public.level_missing(uuid, int) from public, anon, authenticated;   -- internal only
revoke all on function public.level_verification(int) from public, anon;
revoke all on function public.issue_certificate(int, text, text, text) from public, anon;
grant execute on function public.start_attempt(text) to authenticated;
grant execute on function public.finish_attempt(uuid, int, boolean, int) to authenticated;
grant execute on function public.level_verification(int) to authenticated;
grant execute on function public.issue_certificate(int, text, text, text) to authenticated;

notify pgrst, 'reload schema';
