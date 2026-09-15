-- Schedule app: full schema for a brand-new Supabase project.
-- Paste this whole file into the Supabase SQL Editor and run it once.

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

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  name text not null,
  day int not null,
  start_time text not null,
  end_time text not null,
  color text not null default 'purple',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- If upgrading an existing database, run:
-- ALTER TABLE public.schedule_events ADD COLUMN IF NOT EXISTS notes text;
alter table public.schedule_events enable row level security;
create policy "events_select_own" on public.schedule_events for select using (auth.uid() = user_id);
create policy "events_insert_own" on public.schedule_events for insert with check (auth.uid() = user_id);
create policy "events_update_own" on public.schedule_events for update using (auth.uid() = user_id);
create policy "events_delete_own" on public.schedule_events for delete using (auth.uid() = user_id);

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  due_date date,
  due_time time,
  created_at timestamptz not null default now()
);
alter table public.todos enable row level security;
create policy "todos_select_own" on public.todos for select using (auth.uid() = user_id);
create policy "todos_insert_own" on public.todos for insert with check (auth.uid() = user_id);
create policy "todos_update_own" on public.todos for update using (auth.uid() = user_id);
create policy "todos_delete_own" on public.todos for delete using (auth.uid() = user_id);
