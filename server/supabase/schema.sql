-- Run this in Supabase SQL Editor.
create table if not exists public.od_user_state (
  user_key text primary key,
  reg_number text not null,
  od_dates jsonb not null default '[]'::jsonb,
  manual_adjs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists od_user_state_reg_number_idx
  on public.od_user_state (reg_number);

-- CGPA user persistence table.
create table if not exists public.cgpa_user_state (
  reg_number text primary key,
  selected_regulation text not null default '',
  selected_course text not null default '',
  semester_inputs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists cgpa_user_state_updated_at_idx
  on public.cgpa_user_state (updated_at desc);
