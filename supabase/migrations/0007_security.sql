-- Security review fixes. Run once in the Supabase SQL editor (safe to run again).

-- 1. Functions: Postgres lets everyone (PUBLIC, including signed-out visitors) run new functions by default.
--    Take that away and grant exactly who needs each one.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'is_admin', 'extend_pro', 'save_progress', 'set_display_name', 'admin_grant', 'admin_set_role', 'can_teach',
      'is_class_owner', 'is_class_member', 'join_class', 'class_roster', 'issue_certificate', 'verify_certificate')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
-- helpers used inside row level security policies (they only ever answer about the caller)
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.can_teach() to authenticated;
grant execute on function public.is_class_owner(uuid) to authenticated;
grant execute on function public.is_class_member(uuid) to authenticated;
-- actions for signed-in people (each checks auth.uid() or is_admin() inside)
grant execute on function public.save_progress(jsonb) to authenticated;
grant execute on function public.set_display_name(text) to authenticated;
grant execute on function public.admin_grant(text, int, text) to authenticated;
grant execute on function public.admin_set_role(text, text) to authenticated;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.class_roster(uuid) to authenticated;
grant execute on function public.issue_certificate(int, text, text, text) to authenticated;
-- the only public one: checking a certificate code
grant execute on function public.verify_certificate(text) to anon, authenticated;
-- extend_pro stays server-only (service role). Trigger functions are left alone (they cannot be called directly).

-- 2. Progress: must be a JSON object and under 1 MB (stops someone filling the database).
create or replace function public.save_progress(p jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Progress must be an object.'; end if;
  if pg_column_size(p) > 1048576 then raise exception 'Progress is too large to save.'; end if;
  update public.profiles set progress = p, progress_updated_at = now() where id = auth.uid() returning progress_updated_at into t;
  return t;
end $$;
revoke all on function public.save_progress(jsonb) from public, anon;
grant execute on function public.save_progress(jsonb) to authenticated;

create or replace function public.set_display_name(n text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set display_name = nullif(left(btrim(n), 60), '') where id = auth.uid();
$$;
revoke all on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;

-- 3. Classes: a teacher could edit an assignment and move it into someone else's class. Check the new row too.
drop policy if exists "owner updates assignments" on public.assignments;
create policy "owner updates assignments" on public.assignments for update to authenticated
  using (public.is_class_owner(class_id)) with check (public.is_class_owner(class_id));

-- 4. Profile photos: renaming a photo could move it into another person's folder. Check the new name too.
drop policy if exists "avatar update own" on storage.objects;
create policy "avatar update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 5. People cards: the photo address must be https (no tracking pixels over plain http or data: URLs).
alter table public.public_profiles drop constraint if exists public_profiles_avatar_https;
alter table public.public_profiles add constraint public_profiles_avatar_https
  check (avatar_url is null or avatar_url ~* '^https://[^ ]+$') not valid;

-- 6. Certificates: the level name now comes from the server (never from the app), the level must exist,
--    and one person cannot flood the table with copies.
create or replace function public.issue_certificate(p_level int, p_name text, p_level_name text, p_topics text)
returns table (code text, seal text, issued_at timestamptz, earned_on date)
language plpgsql security definer set search_path = public, private, extensions as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  earned text;
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
  select p.progress -> 'certs' ->> p_level::text into earned from public.profiles p where p.id = uid;
  if earned is null or earned !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'This level is not finished on your account yet. Open the app online so your progress syncs, then try again.'; end if;

  select * into c from public.certificates x where x.user_id = uid and x.level = p_level and x.name = nm and not x.revoked and x.replaced_by is null limit 1;
  if found then return query select c.code, c.seal, c.issued_at, c.earned_on; return; end if;
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
-- fix names already stored from the app
update public.certificates set level_name = (array['Foundations', 'First notes and melodies', 'Right and left hand technique', 'Grand staff and both hands',
    'Rhythm', 'Keys and scales', 'Chords and accompaniment', 'Expression and touch', 'Sight-reading and intervals',
    'Advanced technique', 'Playing by ear', 'Jazz piano', 'Four-part writing and arranging', 'Church musician',
    'Styles: pop, blues, Latin, gospel, highlife'])[level + 1]
  where level between 0 and 14;

notify pgrst, 'reload schema';
