import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkerState } from './worker-state';

describe('WorkerState', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-state-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a UUID installation_id on first boot', () => {
    const state = new WorkerState(tmpDir);
    expect(state.installationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('defaults user_consent to false', () => {
    const state = new WorkerState(tmpDir);
    expect(state.hasUserConsent).toBe(false);
  });

  it('defaults is_compute_requested to false', () => {
    const state = new WorkerState(tmpDir);
    expect(state.isComputeRequested).toBe(false);
  });

  it('persists consent across reloads', () => {
    const state = new WorkerState(tmpDir);
    state.setConsent(true);
    const reloaded = new WorkerState(tmpDir);
    expect(reloaded.hasUserConsent).toBe(true);
    expect(reloaded.installationId).toBe(state.installationId);
  });

  it('forces is_compute_requested to false on cold boot', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'worker-state.json'),
      JSON.stringify({
        installation_id: 'test-install-id',
        user_consent: true,
        is_compute_requested: true,
      }),
      'utf8'
    );

    const reloaded = new WorkerState(tmpDir);
    expect(reloaded.installationId).toBe('test-install-id');
    expect(reloaded.hasUserConsent).toBe(true);
    expect(reloaded.isComputeRequested).toBe(false);
  });

  it('falls back to safe defaults when the state file is corrupt', () => {
    fs.writeFileSync(path.join(tmpDir, 'worker-state.json'), 'NOT VALID JSON{{{', 'utf8');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = new WorkerState(tmpDir);
    expect(state.hasUserConsent).toBe(false);
    expect(state.isComputeRequested).toBe(false);
    expect(state.installationId).toBeTruthy();
    spy.mockRestore();
  });

  it('stores lastKnownConfig in-session', () => {
    const state = new WorkerState(tmpDir);
    const config = { worker_enabled: true, kill_switch: false };
    state.setLastKnownConfig(config);
    expect(state.lastKnownConfig).toEqual(config);
  });

  it('does not restore last_known_config from disk on cold boot', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'worker-state.json'),
      JSON.stringify({
        installation_id: 'test-install-id',
        user_consent: true,
        is_compute_requested: false,
        last_known_config: { worker_enabled: true, kill_switch: false },
      }),
      'utf8'
    );

    const reloaded = new WorkerState(tmpDir);
    expect(reloaded.lastKnownConfig).toBeUndefined();
  });
});
