import { TelemetryPayload, TelemetryEvent } from '../control-plane/api-contracts';
import { WorkerState } from './worker-state';
import { WorkloadProvider } from './workload-provider';

import * as os from 'os';

export class Heartbeat {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private eventsQueue: TelemetryEvent[] = [];
  private workerStartTime: number;
  private consecutiveFailures: number = 0;

  constructor(
    private state: WorkerState,
    private controlPlaneUrl: string,
    private productId: string,
    private version: string,
    private getProvider: () => WorkloadProvider | null
  ) {
    this.workerStartTime = Date.now();
  }

  public trackEvent(type: TelemetryEvent['type'], details?: string) {
    this.eventsQueue.push({
      type,
      timestamp: Date.now(),
      details
    });
  }

  public start(intervalMs: number) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Initial heartbeat
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), intervalMs);
  }

  public stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.sendHeartbeat(); // Final flush
  }

  private async sendHeartbeat() {
    const provider = this.getProvider();
    
    let workloadStatus: TelemetryPayload['status'] = 'offline';
    let metrics: any = null;

    if (provider) {
      try {
        const pMetrics = await provider.metrics();
        workloadStatus = pMetrics.status as TelemetryPayload['status'];
        metrics = pMetrics;
      } catch (e) {
        workloadStatus = 'error';
      }
    } else {
      workloadStatus = 'stopped';
    }

    const payload: TelemetryPayload & { platform: string; architecture: string } = {
      installation_id: this.state.installationId,
      product_id: this.productId,
      worker_version: this.version,
      workload_id: provider?.id || 'none',
      status: workloadStatus,
      uptime: Math.floor((Date.now() - this.workerStartTime) / 1000),
      events: [...this.eventsQueue],
      metrics,
      last_heartbeat: Date.now(),
      platform: os.platform(),
      architecture: os.arch()
    };

    // Clear the events queue since we're transmitting them
    this.eventsQueue = [];

    try {
      // We send HEARTBEAT event as part of the events queue to simplify backend ingestion
      const events = [...payload.events, {
         type: 'HEARTBEAT',
         timestamp: payload.last_heartbeat,
         active_workload: payload.workload_id,
         status: payload.status,
         uptime: payload.uptime,
         platform: payload.platform,
         architecture: payload.architecture
      }];

      const reqPayload = {
         installation_id: payload.installation_id,
         product_id: payload.product_id,
         events: events
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.state.controlPlaneToken) headers.Authorization = `Bearer ${this.state.controlPlaneToken}`;
      const response = await fetch(`${this.controlPlaneUrl}/functions/v1/worker-telemetry`, {
         method: 'POST',
         headers,
         body: JSON.stringify(reqPayload)
      });

      if (!response.ok) {
         throw new Error(`Telemetry failed with status ${response.status}`);
      }

      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      console.error(`[Telemetry] Failed to send heartbeat (failure ${this.consecutiveFailures})`, error);
      // Put events back in queue to retry later, keeping up to 1000 events to avoid unbounded memory growth
      this.eventsQueue = [...payload.events, ...this.eventsQueue].slice(0, 1000);
      
      // Exponential backoff logic could be applied here by pausing the interval
      if (this.consecutiveFailures > 5) {
         console.warn('[Telemetry] Experiencing sustained network issues. Backing off...');
      }
    }
  }
}
