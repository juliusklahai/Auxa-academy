-- Classes: a teacher (Plus plan, the teacher role, or an admin) makes a class and shares its code; learners join
-- with the code. The teacher sees each member's name and lesson progress (never their email or plan) and can
-- assign lessons. Learners see their classes and assignments, and can leave at any time.

create or replace function public.can_teach() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and (p.role in ('teacher', 'admin') or (p.plus_until is not null and p.plus_until > now())));
$$;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) <= 20),
  note text check (char_length(note) <= 200),
  due date,
  created_at timestamptz not null default now()
);
create index if not exists class_members_user on public.class_members (user_id);
create index if not exists assignments_class on public.assignments (class_id, created_at desc);

create or replace function public.is_class_owner(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = c and owner = auth.uid());
$$;
create or replace function public.is_class_member(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members where class_id = c and user_id = auth.uid());
$$;

alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.assignments enable row level security;

drop policy if exists "see own or joined classes" on public.classes;
create policy "see own or joined classes" on public.classes for select to authenticated using (owner = auth.uid() or public.is_class_member(id));
drop policy if exists "teachers create classes" on public.classes;
create policy "teachers create classes" on public.classes for insert to authenticated with check (owner = auth.uid() and public.can_teach());
drop policy if exists "owner edits class" on public.classes;
create policy "owner edits class" on public.classes for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "owner deletes class" on public.classes;
create policy "owner deletes class" on public.classes for delete to authenticated using (owner = auth.uid());

drop policy if exists "see memberships" on public.class_members;
create policy "see memberships" on public.class_members for select to authenticated using (user_id = auth.uid() or public.is_class_owner(class_id));
drop policy if exists "leave or remove" on public.class_members;
create policy "leave or remove" on public.class_members for delete to authenticated using (user_id = auth.uid() or public.is_class_owner(class_id));
-- joining happens only through join_class(), which checks the code

drop policy if exists "see assignments" on public.assignments;
create policy "see assignments" on public.assignments for select to authenticated using (public.is_class_owner(class_id) or public.is_class_member(class_id));
drop policy if exists "owner assigns" on public.assignments;
create policy "owner assigns" on public.assignments for insert to authenticated with check (public.is_class_owner(class_id));
drop policy if exists "owner updates assignments" on public.assignments;
create policy "owner updates assignments" on public.assignments for update to authenticated using (public.is_class_owner(class_id));
drop policy if exists "owner removes assignments" on public.assignments;
create policy "owner removes assignments" on public.assignments for delete to authenticated using (public.is_class_owner(class_id));

-- join with a code; returns the class
create or replace function public.join_class(p_code text) returns table (id uuid, name text) language plpgsql security definer set search_path = public as $$
declare c public.classes;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into c from public.classes where code = upper(trim(p_code));
  if c.id is null then raise exception 'No class has that code. Check it with your teacher.'; end if;
  if (select count(*) from public.class_members where class_id = c.id) >= 200 then raise exception 'This class is full.'; end if;
  insert into public.class_members (class_id, user_id) values (c.id, auth.uid()) on conflict do nothing;
  return query select c.id, c.name;
end $$;

-- the teacher's view of a class: names and progress only
create or replace function public.class_roster(p_class uuid) returns table (user_id uuid, name text, joined_at timestamptz, progress jsonb, progress_updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_class_owner(p_class) then raise exception 'Only the teacher can see the class list.'; end if;
  return query
    select m.user_id, coalesce(pp.display_name, p.display_name, 'Learner'), m.joined_at, p.progress, p.progress_updated_at
    from public.class_members m
    join public.profiles p on p.id = m.user_id
    left join public.public_profiles pp on pp.id = m.user_id
    where m.class_id = p_class
    order by 2;
end $$;

revoke all on function public.join_class(text) from public, anon;
grant execute on function public.join_class(text) to authenticated;
revoke all on function public.class_roster(uuid) from public, anon;
grant execute on function public.class_roster(uuid) to authenticated;
