-- One-time upgrade for an EXISTING project to add read-only schedule
-- share links. Paste this whole file into the Supabase SQL Editor and
-- run it once. Safe to run on a database that already has data.

alter table public.schedules add column if not exists share_token uuid;

create unique index if not exists schedules_share_token_idx
  on public.schedules(share_token) where share_token is not null;

-- Lets an anonymous visitor fetch ONE schedule's events by its share
-- token, bypassing RLS only for that exact row. The normal RLS
-- policies on schedules / schedule_events are unchanged, so direct
-- table access still requires being the owner.
create or replace function public.get_shared_schedule(token uuid)
returns table(
  schedule_name text,
  event_id uuid,
  event_name text,
  day int,
  start_time text,
  end_time text,
  color text,
  notes text
)
language sql security definer set search_path = public as $$
  select s.name, e.id, e.name, e.day, e.start_time, e.end_time, e.color, e.notes
  from public.schedules s
  join public.schedule_events e on e.schedule_id = s.id
  where s.share_token = token;
$$;

grant execute on function public.get_shared_schedule(uuid) to anon, authenticated;
