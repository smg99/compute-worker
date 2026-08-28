-- Compute Worker production control-plane schema.
-- Apply with Supabase migrations in the target project.

create extension if not exists pgcrypto;

create table if not exists public.workers (
  id uuid primary key,
  installation_id uuid not null unique,
  user_id uuid null,
  platform text not null,
  architecture text not null,
  version text not null,
  capabilities jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_online boolean not null default true,
  revoked_at timestamptz null
);

create table if not exists public.worker_tokens (
  worker_id uuid primary key references public.workers(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz null
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  description text,
  is_active boolean not null default true
);

create table if not exists public.workloads (
  id text primary key,
  name text not null,
  description text,
  version text not null default '1.0.0',
  capabilities jsonb not null default '[]'::jsonb,
  requires_consent boolean not null default true,
  is_active boolean not null default true
);

create table if not exists public.worker_configurations (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  worker_enabled boolean not null default false,
  active_workload text null references public.workloads(id) on delete set null,
  allowed_workloads text[] not null default '{}',
  max_cpu_percent integer not null default 50 check (max_cpu_percent between 0 and 100),
  max_memory_mb integer not null default 512 check (max_memory_mb >= 0),
  heartbeat_interval_seconds integer not null default 60 check (heartbeat_interval_seconds between 10 and 3600),
  configuration_version text not null default '1.0.0',
  minimum_worker_version text null,
  kill_switch boolean not null default false,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  updated_at timestamptz not null default now(),
  unique(worker_id, product_id)
);
create table if not exists public.heartbeats (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  product_id text not null references public.products(id),
  workload_id text null,
  status text not null,
  uptime integer not null,
  metrics jsonb null,
  reported_at timestamptz not null default now()
);

create table if not exists public.worker_events (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  product_id text not null references public.products(id),
  event_type text not null,
  details text null,
  occurred_at timestamptz not null
);

create index if not exists idx_workers_last_seen on public.workers(last_seen_at);
create index if not exists idx_heartbeats_worker_time on public.heartbeats(worker_id, reported_at desc);
create index if not exists idx_worker_events_worker_time on public.worker_events(worker_id, occurred_at desc);

insert into public.products(id, name, description) values
  ('generic-worker', 'Generic Compute Worker', 'Core worker infrastructure')
on conflict (id) do nothing;

insert into public.workloads(id, name, description, capabilities) values
  ('test-compute', 'Test Compute', 'Deterministic harmless verification workload', '["cpu"]'),
  ('ocr-compute', 'OCR Compute', 'OCR task provider', '["network"]')
on conflict (id) do nothing;

-- Operator-only tables: the Edge Functions use the service role and the
-- dashboard must use authenticated operator access. No public table access.
alter table public.workers enable row level security;
alter table public.worker_tokens enable row level security;
alter table public.products enable row level security;
alter table public.workloads enable row level security;
alter table public.worker_configurations enable row level security;
alter table public.heartbeats enable row level security;
alter table public.worker_events enable row level security;
