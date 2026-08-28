-- Supabase SQL Schema for Compute Worker Control Plane

-- Table: Workers
CREATE TABLE public.workers (
  id UUID PRIMARY KEY,
  installation_id UUID NOT NULL UNIQUE,
  user_id UUID NULL, -- Optional, if linked to a user account
  platform VARCHAR(50) NOT NULL,
  architecture VARCHAR(50) NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  version VARCHAR(50) NOT NULL,
  is_online BOOLEAN DEFAULT true
);

-- Table: Products
CREATE TABLE public.products (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Table: Workloads
CREATE TABLE public.workloads (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  requires_consent BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true
);

-- Table: Worker Configurations (Policies)
CREATE TABLE public.worker_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,
  product_id VARCHAR(50) REFERENCES public.products(id) ON DELETE CASCADE,
  worker_enabled BOOLEAN DEFAULT false,
  active_workload VARCHAR(50) REFERENCES public.workloads(id) ON DELETE SET NULL,
  allowed_workloads TEXT[] NOT NULL DEFAULT '{}',
  max_cpu_percent INT DEFAULT 50,
  max_memory_mb INT DEFAULT 512,
  heartbeat_interval_seconds INT DEFAULT 60,
  configuration_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  minimum_worker_version VARCHAR(50),
  kill_switch BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, product_id)
);

-- Table: Telemetry Heartbeats
CREATE TABLE public.heartbeats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,
  product_id VARCHAR(50) REFERENCES public.products(id),
  workload_id VARCHAR(50),
  status VARCHAR(50) NOT NULL,
  uptime INT NOT NULL,
  metrics JSONB,
  reported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: Worker Events
CREATE TABLE public.worker_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  details TEXT,
  occurred_at TIMESTAMPTZ NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_heartbeats_worker_id ON public.heartbeats(worker_id);
CREATE INDEX idx_worker_events_worker_id ON public.worker_events(worker_id);
CREATE INDEX idx_workers_last_seen ON public.workers(last_seen_at);
