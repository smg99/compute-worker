import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { ConfigPoller } from './config';

const JWT_SECRET = 'test-worker-token';

function signedConfig(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
}

const validPayload = {
  worker_enabled: true,
  allowed_workloads: ['test-compute'],
  active_workload: 'test-compute',
  max_cpu_percent: 50,
  max_memory_mb: 512,
  heartbeat_interval_seconds: 60,
  configuration_version: '1.0.0',
  minimum_worker_version: null,
  kill_switch: false,
};

describe('ConfigPoller', () => {
  const mockState = {
    installationId: 'test-installation-id',
    lastKnownConfig: null as unknown,
    controlPlaneToken: JWT_SECRET,
    setLastKnownConfig: vi.fn(),
  };
  const onConfigUpdate = vi.fn();
  let poller: ConfigPoller;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockState.setLastKnownConfig.mockClear();
    onConfigUpdate.mockClear();
    poller = new ConfigPoller(
      mockState as any,
      'http://localhost:9999',
      'test-product',
      '1.0.0',
      onConfigUpdate
    );
  });

  afterEach(() => {
    poller.stop();
    vi.unstubAllGlobals();
  });

  it('decodes a signed JWT and applies the config', async () => {
    const token = signedConfig(validPayload);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token }),
    } as Response);

    await (poller as any).poll();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9999/functions/v1/worker-config',
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockState.setLastKnownConfig).toHaveBeenCalledTimes(1);
    expect(onConfigUpdate).toHaveBeenCalledTimes(1);
    expect(onConfigUpdate.mock.calls[0][0]).toMatchObject({
      worker_enabled: true,
      active_workload: 'test-compute',
      configuration_version: '1.0.0',
      kill_switch: false,
    });
  });

  it('fails closed when the response has no token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, config: validPayload }),
    } as Response);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await (poller as any).poll();

    expect(onConfigUpdate).toHaveBeenCalledTimes(1);
    expect(onConfigUpdate.mock.calls[0][0]).toMatchObject({
      worker_enabled: false,
      kill_switch: true,
    });
    spy.mockRestore();
  });

  it('fails closed when JWT verification fails', async () => {
    const token = jwt.sign(validPayload, 'wrong-secret', { algorithm: 'HS256' });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token }),
    } as Response);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await (poller as any).poll();

    expect(onConfigUpdate.mock.calls[0][0]).toMatchObject({
      worker_enabled: false,
      kill_switch: true,
    });
    spy.mockRestore();
  });

  it('fails closed when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await (poller as any).poll();

    expect(onConfigUpdate.mock.calls[0][0]).toMatchObject({
      worker_enabled: false,
      kill_switch: true,
    });
    spy.mockRestore();
  });

  it('fails closed when the control plane returns a non-OK status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await (poller as any).poll();

    expect(onConfigUpdate.mock.calls[0][0].kill_switch).toBe(true);
    spy.mockRestore();
  });
});
