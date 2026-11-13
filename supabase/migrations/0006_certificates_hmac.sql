-- Fix for 0004: hmac() needs bytes for both the message and the key. Run once in the SQL editor.
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
notify pgrst, 'reload schema';
