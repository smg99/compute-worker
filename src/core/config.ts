import { RemoteConfigurationRequest, RemoteConfigurationResponse } from '../control-plane/api-contracts';
import { WorkerState } from './worker-state';
import * as jwt from 'jsonwebtoken';
import * as os from 'os';

export class ConfigPoller {
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(
    private state: WorkerState,
    private controlPlaneUrl: string,
    private productId: string,
    private version: string,
    private onConfigUpdate: (config: RemoteConfigurationResponse) => void
  ) {}

  public start() {
    if (this.pollingInterval) return;
    
    // Poll immediately, then every 60 seconds (can be adjusted by remote config later)
    this.poll();
    const interval = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
    this.pollingInterval = setInterval(() => this.poll(), interval);
  }

  public stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async poll() {
    const reqPayload: RemoteConfigurationRequest = {
      installation_id: this.state.installationId,
      product_id: this.productId,
      worker_version: this.version
    };

    try {
      let config: RemoteConfigurationResponse;

      // Always fetch and verify config — never trust disk-stored config without fresh verification
      // (disk state could be tampered with by local malware or manual editing)
      const response = await fetch(`${this.controlPlaneUrl}/functions/v1/worker-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...reqPayload,
          platform: os.platform(),
          architecture: os.arch()
        })
      });

      if (!response.ok) {
        throw new Error(`Control plane returned ${response.status}`);
      }

      const data = await response.json();
      if (!data.token) {
         throw new Error('No JWT token returned from control plane');
      }

      const secret = process.env.WORKER_JWT_SECRET || 'default_dev_secret_replace_in_prod';
      
      try {
         const decoded = jwt.verify(data.token, secret) as any;
         config = decoded as RemoteConfigurationResponse;
      } catch (err) {
         throw new Error('JWT Signature verification failed: ' + err.message);
      }

      if (!config.configuration_version) {
        throw new Error('Invalid configuration: missing version');
      }

      this.state.setLastKnownConfig(config);
      this.onConfigUpdate(config);

    } catch (error) {
      console.error('Config poller failed, falling back to safe disabled defaults', error);
      // Safe default on failure
      this.onConfigUpdate({
        worker_enabled: false,
        allowed_workloads: [],
        active_workload: null,
        max_cpu_percent: 0,
        max_memory_mb: 0,
        heartbeat_interval_seconds: 60,
        configuration_version: '0.0.0',
        minimum_worker_version: null,
        kill_switch: true // fail closed
      });
    }
  }
}
