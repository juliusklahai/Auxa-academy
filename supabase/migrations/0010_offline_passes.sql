-- 0010: practice done offline can count toward certificates.
--
-- Offline, the server cannot witness an attempt (0008), so the app keeps the results on the phone and
-- sends them when it is back online. The server checks each one for plausibility (a real exercise, enough
-- real time, the pass mark, enough notes, a sensible date) and keeps them apart from witnessed passes.
-- They count for a certificate once the learner has ALSO passed at least one exercise of the same lesson
-- while online (a spot check): offline work is trusted, but confirmed lesson by lesson.
--
-- Run after 0008 and 0009. Safe to run again.

create table if not exists public.offline_passes (
  user_id uuid not null references auth.users on delete cascade,
  exercise_id text not null,
  best int not null default 0,
  passes int not null default 0,
  last_pass_at timestamptz,
  received_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
alter table public.offline_passes enable row level security;
drop policy if exists "own offline passes" on public.offline_passes;
create policy "own offline passes" on public.offline_passes for select to authenticated using (user_id = auth.uid());
-- no insert/update/delete policies: only submit_offline_attempts() writes here

-- p: [{ "exercise": "L1-2-a", "score": 92, "passed": true, "hits": 14, "ms": 41000, "at": "2026-11-17T09:00:00Z" }, ...]
create or replace function public.submit_offline_attempts(p jsonb) returns int
language plpgsql security definer set search_path = public, private as $$
declare uid uuid := auth.uid(); a jsonb; c private.exercise_catalog%rowtype; sc int; at timestamptz; n int := 0; today int;
begin
  if uid is null then return 0; end if;
  if jsonb_typeof(p) <> 'array' then return 0; end if;
  -- a generous daily ceiling: nobody genuinely passes more than this in a day
  select coalesce(sum(passes), 0) into today from public.offline_passes where user_id = uid and received_at > now() - interval '1 day';
  for a in select * from jsonb_array_elements(p) limit 300 loop
    exit when today + n >= 400;
    select * into c from private.exercise_catalog where id = a->>'exercise';
    continue when c.id is null;
    sc := greatest(0, least(100, coalesce((a->>'score')::int, 0)));
    begin at := (a->>'at')::timestamptz; exception when others then continue; end;
    continue when at is null or at > now() + interval '1 day' or at < now() - interval '60 days';
    continue when coalesce((a->>'passed')::boolean, false) is not true or sc < c.pass_score;
    continue when coalesce((a->>'hits')::int, 0) < ceil(c.groups * 0.6);
    continue when coalesce((a->>'ms')::int, 0) < c.min_ms;
    insert into public.offline_passes as o (user_id, exercise_id, best, passes, last_pass_at)
    values (uid, c.id, sc, 1, at)
    on conflict (user_id, exercise_id) do update set
      best = greatest(o.best, sc), passes = o.passes + 1,
      last_pass_at = greatest(o.last_pass_at, at), received_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- how many pieces of a level are still missing (0 = the level can be sealed). Witnessed passes always
-- count; offline passes count in a lesson once that lesson has at least one witnessed pass.
create or replace function public.level_missing(p_uid uuid, p_level int) returns int
language sql stable security definer set search_path = public, private as $$
  with ex as (
    select c.*, coalesce(v.passes, 0) as vp, coalesce(o.passes, 0) as op
    from private.exercise_catalog c
    left join public.verified_passes v on v.user_id = p_uid and v.exercise_id = c.id
    left join public.offline_passes o on o.user_id = p_uid and o.exercise_id = c.id
    where c.level = p_level and c.track = 'piano'
  ), les as (
    select lesson_id, bool_or(vp > 0) as witnessed from ex group by lesson_id
  ), ex2 as (
    select ex.*, (ex.vp >= ex.required_passes) or (les.witnessed and ex.vp + ex.op >= ex.required_passes) as done
    from ex join les using (lesson_id)
  )
  select (select count(*) from ex2 where not piece and not done)::int
       + (select count(*) from (select lesson_id from ex2 where piece group by lesson_id having not bool_or(done)) x)::int;
$$;

-- for the app: per exercise, witnessed and offline passes, and whether its lesson is confirmed online
drop function if exists public.level_verification(int);
create function public.level_verification(p_level int)
returns table (exercise_id text, lesson_id text, piece boolean, required int, passes int, offline int, witnessed boolean)
language sql stable security definer set search_path = public, private as $$
  with ex as (
    select c.id, c.lesson_id, c.piece, c.required_passes, coalesce(v.passes, 0) as vp, coalesce(o.passes, 0) as op
    from private.exercise_catalog c
    left join public.verified_passes v on v.user_id = auth.uid() and v.exercise_id = c.id
    left join public.offline_passes o on o.user_id = auth.uid() and o.exercise_id = c.id
    where c.level = p_level and c.track = 'piano' and auth.uid() is not null
  )
  select ex.id, ex.lesson_id, ex.piece, ex.required_passes, ex.vp, ex.op, bool_or(ex.vp > 0) over (partition by ex.lesson_id)
  from ex order by ex.lesson_id, ex.id;
$$;

revoke all on function public.submit_offline_attempts(jsonb) from public, anon;
revoke all on function public.level_missing(uuid, int) from public, anon, authenticated;
revoke all on function public.level_verification(int) from public, anon;
grant execute on function public.submit_offline_attempts(jsonb) to authenticated;
grant execute on function public.level_verification(int) to authenticated;

notify pgrst, 'reload schema';
