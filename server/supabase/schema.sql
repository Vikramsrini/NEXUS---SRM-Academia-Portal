-- Run this in Supabase SQL Editor.
create table if not exists public.od_user_state (
  user_key text primary key,
  reg_number text not null,
  od_dates jsonb not null default '[]'::jsonb,
  manual_adjs jsonb not null default '{}'::jsonb,
  update_v1_dismissed boolean not null default false,
  updated_at timestamptz not null default (now() at time zone 'utc' at time zone 'Asia/Kolkata')
);

create index if not exists od_user_state_reg_number_idx
  on public.od_user_state (reg_number);

-- CGPA user persistence table.
create table if not exists public.cgpa_user_state (
  reg_number text primary key,
  selected_regulation text not null default '',
  selected_course text not null default '',
  semester_inputs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default (now() at time zone 'utc' at time zone 'Asia/Kolkata')
);

create index if not exists cgpa_user_state_updated_at_idx
  on public.cgpa_user_state (updated_at desc);

create table if not exists public.daily_thoughts (
  date_key text primary key,
  thought text not null,
  author text,
  fetched_at timestamptz not null default now()
);

-- Timetable user persistence (hidden/optional classes).
create table if not exists public.timetable_user_state (
  user_key text primary key,
  reg_number text not null,
  hidden_classes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default (now() at time zone 'utc' at time zone 'Asia/Kolkata')
);

create index if not exists timetable_user_state_reg_number_idx
  on public.timetable_user_state (reg_number);

create table if not exists public.global_calendar (
  id int primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default (now() at time zone 'utc' at time zone 'Asia/Kolkata')
);

-- Ensure there is only one row for the global calendar
create unique index if not exists global_calendar_single_row_idx on public.global_calendar (id);

-- Attendance History snapshots for tracking presence
create table if not exists public.attendance_snapshots (
  id uuid primary key default gen_random_uuid(),
  reg_number text not null,
  course_code text not null,
  hours_conducted int not null,
  hours_absent int not null,
  synced_at timestamptz not null default (now() at time zone 'utc' at time zone 'Asia/Kolkata')
);

create index if not exists attendance_snapshots_reg_number_course_code_idx
  on public.attendance_snapshots (reg_number, course_code);

-- Full Attendance state per user
create table if not exists public.attendance_user_state (
  reg_number text primary key,
  attendance_data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default (now() at time zone 'utc' at time zone 'Asia/Kolkata')
);

create index if not exists attendance_user_state_updated_at_idx
  on public.attendance_user_state (updated_at desc);

-- Full Marks state per user
create table if not exists public.marks_user_state (
  reg_number text primary key,
  marks_data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default (now() at time zone 'utc' at time zone 'Asia/Kolkata')
);

create index if not exists marks_user_state_updated_at_idx
  on public.marks_user_state (updated_at desc);

-- Marks History snapshots for tracking mark updates
create table if not exists public.marks_snapshots (
  id uuid primary key default gen_random_uuid(),
  reg_number text not null,
  course_code text not null,
  assessment_type text not null,
  marks_obtained numeric not null,
  max_marks numeric not null,
  synced_at timestamptz not null default (now() at time zone 'utc' at time zone 'Asia/Kolkata')
);

create index if not exists marks_snapshots_reg_number_course_code_idx
  on public.marks_snapshots (reg_number, course_code);
