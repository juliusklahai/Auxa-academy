-- 0011: a learner's name can be changed only once.
-- Setting a name on an account that has none is free; after that, one change, then it is locked.
-- Certificates now always take the name from the account, so the rule cannot be dodged by sending
-- another name to issue_certificate. Admins can still correct a name (profiles update policy).
-- Run in the Supabase SQL Editor after 0010.

alter table public.profiles add column if not exists name_changes int not null default 0;

create or replace function public.set_display_name(n text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur text;
  used int;
  nm text := nullif(left(btrim(regexp_replace(coalesce(n, ''), '\s+', ' ', 'g')), 60), '');
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  select nullif(btrim(display_name), ''), name_changes into cur, used from public.profiles where id = uid for update;
  if nm is not distinct from cur then return; end if;
  if nm is null then raise exception 'Your name cannot be empty.'; end if;
  if nm ~ '[<>]' then raise exception 'Please use only letters and normal punctuation in your name.'; end if;
  if cur is null then
    update public.profiles set display_name = nm where id = uid;           -- first name on the account
  elsif coalesce(used, 0) >= 1 then
    raise exception 'NAME_LOCKED: Your name has already been changed once and cannot be changed again. Contact support if it is wrong.';
  else
    update public.profiles set display_name = nm, name_changes = coalesce(used, 0) + 1 where id = uid;
  end if;
end $$;
revoke all on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;

create or replace function public.issue_certificate(p_level int, p_name text, p_level_name text, p_topics text)
returns table (code text, seal text, issued_at timestamptz, earned_on date)
language plpgsql security definer set search_path = public, private, extensions as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  earned text;
  missing int;
  -- the name always comes from the account (p_name is ignored), so it follows the one-change rule
  nm text := left(btrim(regexp_replace(coalesce((select pr.display_name from public.profiles pr where pr.id = auth.uid()), ''), '\s+', ' ', 'g')), 40);
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
  if nm = '' then raise exception 'Please add your name in your account first.'; end if;
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
revoke all on function public.issue_certificate(int, text, text, text) from public, anon;
grant execute on function public.issue_certificate(int, text, text, text) to authenticated;

notify pgrst, 'reload schema';
