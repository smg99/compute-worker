/**
 * API Contracts for Remote Control Plane
 */

export interface RemoteConfigurationRequest {
  installation_id: string;
  product_id: string;
  worker_version: string;
}

export interface RemoteConfigurationResponse {
  worker_enabled: boolean;
  allowed_workloads: string[];
  active_workload: string | null;
  max_cpu_percent: number;
  max_memory_mb: number;
  heartbeat_interval_seconds: number;
  configuration_version: string;
  minimum_worker_version: string | null;
  kill_switch: boolean;
}

export interface TelemetryPayload {
  installation_id: string;
  product_id: string;
  worker_version: string;
  workload_id: string;
  status: 'stopped' | 'running' | 'error' | 'offline';
  uptime: number;
  events: TelemetryEvent[];
  metrics?: any;
  last_heartbeat: number;
}

export interface TelemetryEvent {
  type: 'WORKER_STARTED' | 'WORKER_STOPPED' | 'WORKLOAD_STARTED' | 'WORKLOAD_STOPPED' | 'WORKLOAD_CRASHED' | 'CONSENT_ENABLED' | 'CONSENT_DISABLED' | 'ERROR';
  timestamp: number;
  details?: string;
}
