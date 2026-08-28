import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Heartbeat } from './heartbeat';

describe('Heartbeat', () => {
  const mockState = { installationId: 'test-installation-id' };
  const getProvider = vi.fn();
  let heartbeat: Heartbeat;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    getProvider.mockReset();
    heartbeat = new Heartbeat(
      mockState as any,
      'http://localhost:9999',
      'test-product',
      '1.0.0',
      getProvider
    );
  });

  afterEach(() => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    heartbeat.stop();
    vi.unstubAllGlobals();
  });

  it('sends a HEARTBEAT event when no provider is active', async () => {
    getProvider.mockReturnValue(null);
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

    await (heartbeat as any).sendHeartbeat();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9999/functions/v1/worker-telemetry',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
    expect(body.installation_id).toBe('test-installation-id');
    expect(body.product_id).toBe('test-product');
    expect(body.events.at(-1).type).toBe('HEARTBEAT');
  });

  it('includes queued events in the telemetry payload', async () => {
    getProvider.mockReturnValue(null);
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    heartbeat.trackEvent('WORKER_STARTED');

    await (heartbeat as any).sendHeartbeat();

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
    expect(body.events.map((e: { type: string }) => e.type)).toContain('WORKER_STARTED');
    expect(body.events.map((e: { type: string }) => e.type)).toContain('HEARTBEAT');
  });

  it('includes provider metrics when a workload is running', async () => {
    const metrics = { status: 'running', cpu_percent: 30, uptime_seconds: 100 };
    getProvider.mockReturnValue({
      id: 'test-compute',
      metrics: vi.fn().mockResolvedValue(metrics),
    });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

    await (heartbeat as any).sendHeartbeat();

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
    expect(body.events.at(-1).status).toBe('running');
    expect(body.events.at(-1).active_workload).toBe('test-compute');
  });

  it('requeues events when fetch fails', async () => {
    getProvider.mockReturnValue(null);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network failure'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    heartbeat.trackEvent('ERROR', 'boom');

    await (heartbeat as any).sendHeartbeat();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    await (heartbeat as any).sendHeartbeat();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1].body as string);
    expect(body.events.map((e: { type: string }) => e.type)).toContain('ERROR');
  });
});
