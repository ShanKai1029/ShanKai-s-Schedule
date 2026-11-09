-- One-time upgrade for an EXISTING project to let todos have an
-- optional start date in addition to their due date. Paste this whole
-- file into the Supabase SQL Editor and run it once. Safe to run on a
-- database that already has data.

alter table public.todos add column if not exists start_date date;
