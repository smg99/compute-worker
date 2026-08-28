import { WorkloadProvider } from './workload-provider';
import { WorkerState } from './worker-state';
import { ConfigPoller } from './config';
import { Security } from './security';
import { Heartbeat } from './heartbeat';
import { ResourceManager } from './resource-manager';
import { RemoteConfigurationResponse } from '../control-plane/api-contracts';
import { WorkloadProcessProvider } from './workload-process';
import { TestComputeProvider } from '../providers/test-compute';
import { OcrComputeProvider } from '../providers/ocr-compute';

export class WorkerRuntime {
  private activeProvider: WorkloadProvider | null = null;
  private providers: Map<string, WorkloadProvider> = new Map();

  private poller: ConfigPoller;
  private security: Security;
  private heartbeat: Heartbeat;
  private resourceManager: ResourceManager;
  private readonly version: string;
  private workloadConfig: RemoteConfigurationResponse | null = null;
  private restartHistory: number[] = [];
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxRestarts = 3;
  private readonly restartWindowMs = 60_000;

  constructor(
    public readonly state: WorkerState,
    controlPlaneUrl: string,
    productId: string,
    version: string
  ) {
    this.version = version;
    this.security = new Security(this.state);
    this.resourceManager = new ResourceManager();
    
    this.poller = new ConfigPoller(
      this.state,
      controlPlaneUrl,
      productId,
      version,
      (config) => this.onRemoteConfigReceived(config)
    );

    this.heartbeat = new Heartbeat(
      this.state,
      controlPlaneUrl,
      productId,
      version,
      () => this.activeProvider
    );
  }

  public registerProvider(provider: WorkloadProvider) {
    this.providers.set(provider.id, provider);
  }

  public start() {
    this.poller.start();
    // Heartbeat will be started with an interval from remote config, default 60s
    this.heartbeat.start(60000);
    this.heartbeat.trackEvent('WORKER_STARTED');
  }

  public async stop() {
    this.poller.stop();
    if (this.activeProvider) {
      await this.stopActiveWorkload();
    }
    this.heartbeat.trackEvent('WORKER_STOPPED');
    this.heartbeat.stop();
  }

  private async onRemoteConfigReceived(config: RemoteConfigurationResponse) {
    // 1. Re-evaluate authorization state
    this.workloadConfig = config;
    const isAuthorized = this.security.isComputeAuthorized(config, this.version);

    if (!isAuthorized) {
      if (this.activeProvider) {
        console.log('[WorkerRuntime] Compute is no longer authorized. Stopping active workload.');
        await this.stopActiveWorkload();
      }
      return;
    }

    // 2. We are authorized. Apply resource limits.
    this.resourceManager.applyLimits(config.max_cpu_percent, config.max_memory_mb);

    // 3. Update heartbeat interval
    this.heartbeat.start(config.heartbeat_interval_seconds * 1000);

    // 4. Ensure the correct workload is running
    if (this.activeProvider && this.activeProvider.id !== config.active_workload) {
      // Swapping workloads
      await this.stopActiveWorkload();
    }

    if (!this.activeProvider && config.active_workload) {
      const provider = this.providers.get(config.active_workload);
      if (provider) {
        await this.startWorkload(provider, config);
      } else {
        console.error(`[WorkerRuntime] Authorized workload '${config.active_workload}' is not registered/supported by this worker.`);
        this.heartbeat.trackEvent('ERROR', `Unsupported workload: ${config.active_workload}`);
      }
    }
  }

  private async startWorkload(provider: WorkloadProvider, config: RemoteConfigurationResponse) {
    try {
      this.activeProvider = provider;
      await provider.initialize();
      await provider.start({
        id: config.active_workload as string,
        version: config.configuration_version,
        max_cpu_percent: config.max_cpu_percent
      });
      if (provider instanceof WorkloadProcessProvider) {
        provider.onUnexpectedExit((error) => this.handleWorkloadCrash(provider, error));
      }
      this.resourceManager.startMonitoring(provider, async () => {
        await this.stopActiveWorkload();
      }, provider instanceof WorkloadProcessProvider ? provider.processId ?? undefined : undefined);
      this.heartbeat.trackEvent('WORKLOAD_STARTED', provider.id);
      // console.log(`[WorkerRuntime] Started workload: ${provider.id}`);
    } catch (e) {
      console.error(`[WorkerRuntime] Failed to start workload ${provider.id}`, e);
      this.heartbeat.trackEvent('WORKLOAD_CRASHED', provider.id);
      this.activeProvider = null;
    }
  }

  private async stopActiveWorkload() {
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    this.resourceManager.stopMonitoring();
    const provider = this.activeProvider;
    if (!provider) return;

    // Clear the active slot before awaiting shutdown so overlapping remote
    // config polls cannot attempt to stop the same child process twice.
    this.activeProvider = null;
    const id = provider.id;
    try {
      await provider.stop();
      this.heartbeat.trackEvent('WORKLOAD_STOPPED', id);
    } catch (e) {
      console.error(`[WorkerRuntime] Error stopping workload ${id}`, e);
    }
  }


  private handleWorkloadCrash(provider: WorkloadProvider, error: Error): void {
    if (this.activeProvider !== provider) return;
    this.activeProvider = null;
    this.resourceManager.stopMonitoring();
    this.heartbeat.trackEvent('WORKLOAD_CRASHED', provider.id);
    console.error(`[WorkerRuntime] Workload ${provider.id} crashed: ${error.message}`);

    const config = this.workloadConfig;
    if (!config || !this.security.isComputeAuthorized(config, this.version)) return;
    const now = Date.now();
    this.restartHistory = this.restartHistory.filter(ts => now - ts < this.restartWindowMs);
    if (this.restartHistory.length >= this.maxRestarts) {
      console.error(`[WorkerRuntime] Restart limit reached for ${provider.id}; entering SAFE/DISABLED.`);
      this.heartbeat.trackEvent('ERROR', `Restart limit reached: ${provider.id}`);
      return;
    }
    const attempt = this.restartHistory.length;
    const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
    this.restartHistory.push(now);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.workloadConfig !== config || !this.security.isComputeAuthorized(config, this.version)) return;
      void this.startWorkload(provider, config);
    }, delayMs);
  }

  // Used by Local API
  public enableLocalConsent() {
    if (!this.state.hasUserConsent) {
      this.state.setConsent(true);
      this.heartbeat.trackEvent('CONSENT_ENABLED');
      // Trigger a re-evaluation of the last known config immediately
      if (this.state.lastKnownConfig) {
        this.onRemoteConfigReceived(this.state.lastKnownConfig);
      }
    }
  }

  public disableLocalConsent() {
    if (this.state.hasUserConsent) {
      this.state.setConsent(false);
      this.heartbeat.trackEvent('CONSENT_DISABLED');
      // Re-evaluating will immediately stop the workload
      if (this.state.lastKnownConfig) {
        this.onRemoteConfigReceived(this.state.lastKnownConfig);
      }
    }
  }

  public requestCompute() {
    if (!this.state.isComputeRequested) {
      this.state.setComputeRequested(true);
      if (this.state.lastKnownConfig) {
        this.onRemoteConfigReceived(this.state.lastKnownConfig);
      }
    }
  }

  public releaseCompute() {
    if (this.state.isComputeRequested) {
      this.state.setComputeRequested(false);
      if (this.state.lastKnownConfig) {
        this.onRemoteConfigReceived(this.state.lastKnownConfig);
      }
    }
  }

  public getStatus() {
    const config = this.state.lastKnownConfig;
    return {
      worker_id: this.state.installationId,
      worker_process_id: process.pid,
      worker_version: this.version,
      // Determine overall worker state based on authorization and active workload
      state: (this.security.isComputeAuthorized(config, this.version) && this.activeProvider) ? 'WORKLOAD_RUNNING' : (this.security.isComputeAuthorized(config, this.version) ? 'AUTHORIZED' : 'SAFE/DISABLED'),
      consent: this.state.hasUserConsent,
      compute_requested: this.state.isComputeRequested,
      remote_authorization: config?.worker_enabled || false,
      kill_switch: config?.kill_switch || false,
      active_workload: this.activeProvider?.id || 'none',
      workload_process_id: this.activeProvider instanceof WorkloadProcessProvider ? this.activeProvider.processId : null,
      workload_state: this.activeProvider ? 'running' : 'stopped',
      configuration_version: config?.configuration_version || 'none',
      uptime: process.uptime(),
      platform: require('os').platform(),
      architecture: require('os').arch(),
      last_heartbeat: Date.now(),
      resource_manager_status: this.resourceManager.getStatus()
    };
  }

  public async executeTask(payload: any): Promise<any> {
    if (this.activeProvider && this.activeProvider.executeTask) {
       return await this.activeProvider.executeTask(payload);
    }
    throw new Error('No active provider supports task execution');
  }

  public trackTelemetryEvent(type: string, details?: string) {
     this.heartbeat.trackEvent(type, details);
  }
}
