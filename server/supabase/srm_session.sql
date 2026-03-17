-- Table to store SRM session tokens for serverless use
create table if not exists public.srm_session (
  id serial primary key,
  csrf_token text not null,
  cookies text not null,
  updated_at timestamptz not null default now()
);

-- Only one row is needed; always update id=1
insert into public.srm_session (id, csrf_token, cookies)
values (1, '', '')
on conflict (id) do nothing;