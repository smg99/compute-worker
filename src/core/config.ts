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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.state.controlPlaneToken) headers.Authorization = `Bearer ${this.state.controlPlaneToken}`;
      const response = await fetch(`${this.controlPlaneUrl}/functions/v1/worker-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...reqPayload,
          platform: os.platform(),
          architecture: os.arch()
        })
      });

      // A fresh installation enrolls once, then all policy requests are authenticated.
      if (response.status === 401 && !this.state.controlPlaneToken) {
        const registration = await fetch(`${this.controlPlaneUrl}/functions/v1/worker-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...reqPayload, platform: os.platform(), architecture: os.arch() })
        });
        if (!registration.ok) throw new Error(`Worker registration failed with ${registration.status}`);
        const registered = await registration.json() as { worker_token?: string };
        if (!registered.worker_token) throw new Error('Worker registration returned no token');
        this.state.setControlPlaneToken(registered.worker_token);
        headers.Authorization = `Bearer ${registered.worker_token}`;
        const retry = await fetch(`${this.controlPlaneUrl}/functions/v1/worker-config`, {
          method: 'POST', headers, body: JSON.stringify({ ...reqPayload, platform: os.platform(), architecture: os.arch() })
        });
        if (!retry.ok) throw new Error(`Control plane returned ${retry.status}`);
        const retryData = await retry.json();
        if (!retryData.token) throw new Error('No signed configuration returned');
        config = jwt.verify(retryData.token, this.state.controlPlaneToken!, { algorithms: ['HS256'] }) as RemoteConfigurationResponse;
      } else {
        if (!response.ok) throw new Error(`Control plane returned ${response.status}`);
        const data = await response.json();
        if (!data.token) throw new Error('No signed configuration returned');
        if (!this.state.controlPlaneToken) throw new Error('Worker is not enrolled');
        config = jwt.verify(data.token, this.state.controlPlaneToken, { algorithms: ['HS256'] }) as RemoteConfigurationResponse;
      }

      if (config.expires_at && config.expires_at * 1000 < Date.now()) throw new Error('Configuration expired');

      if (!config.configuration_version) {
        throw new Error('Invalid configuration: missing version');
      }

      this.state.setLastKnownConfig(config);
      this.onConfigUpdate(config);

    } catch (error) {
      console.error('Config poller failed, falling back to safe disabled defaults', error);
      // Safe default on failure. Persist it so status cannot report stale
      // remote authorization after an expired/unreachable policy.
      const safeConfig: RemoteConfigurationResponse = {
        worker_enabled: false,
        allowed_workloads: [],
        active_workload: null,
        max_cpu_percent: 0,
        max_memory_mb: 0,
        heartbeat_interval_seconds: 60,
        configuration_version: '0.0.0',
        minimum_worker_version: null,
        kill_switch: true
      };
      this.state.setLastKnownConfig(safeConfig);
      this.onConfigUpdate(safeConfig);
    }
  }
}
