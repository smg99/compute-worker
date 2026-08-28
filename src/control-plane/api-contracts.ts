/**
 * API Contracts for Remote Control Plane
 */

export interface WorkerRegistrationRequest {
  installation_id: string;
  product_id: string;
  worker_version: string;
  platform: string;
  architecture: string;
}

export interface WorkerRegistrationResponse {
  worker_token: string;
  registered: boolean;
}

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
  expires_at?: number;
  issued_at?: number;
  policy_id?: string;
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
  platform?: string;
  architecture?: string;
}

export interface TelemetryEvent {
  type: 'WORKER_STARTED' | 'WORKER_STOPPED' | 'WORKLOAD_STARTED' | 'WORKLOAD_STOPPED' | 'WORKLOAD_CRASHED' | 'CONSENT_ENABLED' | 'CONSENT_DISABLED' | 'ERROR' | 'HEARTBEAT' | 'WORKLOAD_RESTARTED' | 'WORKER_ONLINE' | 'WORKER_OFFLINE' | 'POLICY_UPDATED';
  timestamp: number;
  details?: string;
}
