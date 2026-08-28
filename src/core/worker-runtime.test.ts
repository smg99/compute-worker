import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkerState } from './worker-state';
import { WorkerRuntime } from './worker-runtime';
import { WorkloadProvider, WorkloadConfiguration, WorkloadMetrics } from './workload-provider';
import { RemoteConfigurationResponse } from '../control-plane/api-contracts';

class FakeProvider implements WorkloadProvider {
  readonly id = 'test-compute';
  readonly name = 'Test';
  readonly version = '1.0.0';
  readonly description = 'test';
  readonly capabilities: string[] = [];
  readonly resource_requirements = {};
  readonly supported_platforms = ['darwin'];
  started = false;

  async initialize(): Promise<void> {}
  async start(_config: WorkloadConfiguration): Promise<void> {
    this.started = true;
  }
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async stop(): Promise<void> {
    this.started = false;
  }
  async shutdown(): Promise<void> {}
  async metrics(): Promise<WorkloadMetrics> {
    return { status: this.started ? 'running' : 'stopped', uptime_seconds: 1 };
  }
}

function makeConfig(overrides: Partial<RemoteConfigurationResponse> = {}): RemoteConfigurationResponse {
  return {
    worker_enabled: true,
    allowed_workloads: ['test-compute'],
    active_workload: 'test-compute',
    max_cpu_percent: 50,
    max_memory_mb: 512,
    heartbeat_interval_seconds: 60,
    configuration_version: '1.0.0',
    minimum_worker_version: null,
    kill_switch: false,
    ...overrides,
  };
}

describe('WorkerRuntime', () => {
  let tmpDir: string;
  let state: WorkerState;
  let runtime: WorkerRuntime;
  let provider: FakeProvider;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-'));
    state = new WorkerState(tmpDir);
    runtime = new WorkerRuntime(state, 'http://localhost:9999', 'test-product', '1.0.0');
    provider = new FakeProvider();
    runtime.registerProvider(provider);
  });

  afterEach(async () => {
    await runtime.stop();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not start a workload without consent and request', async () => {
    await (runtime as any).onRemoteConfigReceived(makeConfig());
    expect(provider.started).toBe(false);
  });

  it('starts the registered workload when authorized', async () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    await (runtime as any).onRemoteConfigReceived(makeConfig());
    expect(provider.started).toBe(true);
  });

  it('stops the workload when kill_switch is enabled', async () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    await (runtime as any).onRemoteConfigReceived(makeConfig());
    expect(provider.started).toBe(true);

    await (runtime as any).onRemoteConfigReceived(makeConfig({ kill_switch: true }));
    expect(provider.started).toBe(false);
  });

  it('does not start an unregistered workload', async () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await (runtime as any).onRemoteConfigReceived(
      makeConfig({
        allowed_workloads: ['missing-workload'],
        active_workload: 'missing-workload',
      })
    );
    expect(provider.started).toBe(false);
    spy.mockRestore();
  });

  it('reports the constructor version in getStatus', () => {
    const status = runtime.getStatus();
    expect(status.worker_version).toBe('1.0.0');
  });
});
