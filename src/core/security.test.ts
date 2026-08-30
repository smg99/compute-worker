import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Security } from './security';
import { WorkerState } from './worker-state';
import { RemoteConfigurationResponse } from '../control-plane/api-contracts';

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

describe('Security', () => {
  let tmpDir: string;
  let state: WorkerState;
  let security: Security;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-test-'));
    state = new WorkerState(tmpDir);
    security = new Security(state);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects when the user has not consented', () => {
    state.setConsent(false);
    state.setComputeRequested(true);
    expect(security.isComputeAuthorized(makeConfig(), '1.0.0')).toBe(false);
  });

  it('rejects when compute has not been requested', () => {
    state.setConsent(true);
    state.setComputeRequested(false);
    expect(security.isComputeAuthorized(makeConfig(), '1.0.0')).toBe(false);
  });

  it('rejects when remote config is null', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(security.isComputeAuthorized(null, '1.0.0')).toBe(false);
  });

  it('rejects when kill_switch is true even if worker_enabled is true', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(security.isComputeAuthorized(makeConfig({ kill_switch: true }), '1.0.0')).toBe(false);
  });

  it('rejects when worker_enabled is false', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(security.isComputeAuthorized(makeConfig({ worker_enabled: false }), '1.0.0')).toBe(false);
  });

  it('rejects when worker version is below minimum', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(
      security.isComputeAuthorized(makeConfig({ minimum_worker_version: '2.0.0' }), '1.0.0')
    ).toBe(false);
  });

  it('accepts when worker version meets the minimum', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(
      security.isComputeAuthorized(makeConfig({ minimum_worker_version: '1.0.0' }), '1.0.0')
    ).toBe(true);
  });

  it('compares dotted versions numerically instead of lexicographically', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(
      security.isComputeAuthorized(makeConfig({ minimum_worker_version: '1.10.0' }), '1.9.0')
    ).toBe(false);
    expect(
      security.isComputeAuthorized(makeConfig({ minimum_worker_version: '1.9.0' }), '1.10.0')
    ).toBe(true);
  });

  it('rejects malformed minimum versions safely', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(
      security.isComputeAuthorized(makeConfig({ minimum_worker_version: 'latest' }), '1.0.0')
    ).toBe(false);
  });

  it('rejects when active_workload is not in allowed_workloads', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(
      security.isComputeAuthorized(makeConfig({ active_workload: 'unknown' }), '1.0.0')
    ).toBe(false);
  });

  it('rejects when active_workload is null', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(
      security.isComputeAuthorized(makeConfig({ active_workload: null }), '1.0.0')
    ).toBe(false);
  });

  it('accepts when all authorization conditions are met', () => {
    state.setConsent(true);
    state.setComputeRequested(true);
    expect(security.isComputeAuthorized(makeConfig(), '1.0.0')).toBe(true);
  });
});
