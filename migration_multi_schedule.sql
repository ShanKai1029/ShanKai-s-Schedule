-- One-time upgrade for an EXISTING project to the multi-schedule version.
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to run on a database that already has data in schedule_events:
-- it creates a "我的課表" schedule per user and moves their existing
-- events into it before making schedule_id required.

create extension if not exists pgcrypto;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.schedules enable row level security;
create policy "schedules_select_own" on public.schedules for select using (auth.uid() = user_id);
create policy "schedules_insert_own" on public.schedules for insert with check (auth.uid() = user_id);
create policy "schedules_update_own" on public.schedules for update using (auth.uid() = user_id);
create policy "schedules_delete_own" on public.schedules for delete using (auth.uid() = user_id);

alter table public.schedule_events add column if not exists schedule_id uuid references public.schedules(id) on delete cascade;

do $$
declare r record;
declare new_id uuid;
begin
  for r in select distinct user_id from public.schedule_events where schedule_id is null loop
    insert into public.schedules(user_id, name) values (r.user_id, '我的課表') returning id into new_id;
    update public.schedule_events set schedule_id = new_id where user_id = r.user_id and schedule_id is null;
  end loop;
end $$;

alter table public.schedule_events alter column schedule_id set not null;
