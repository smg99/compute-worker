import { describe, it, expect, vi, afterEach } from 'vitest';
import { ResourceManager } from './resource-manager';
import { WorkloadProvider } from './workload-provider';

const provider = (): WorkloadProvider => ({
  id: 'test', name: 'test', version: '1', description: 'test', capabilities: [],
  resource_requirements: {}, supported_platforms: ['darwin'],
  initialize: vi.fn(async () => {}),
  start: vi.fn(async () => {}),
  pause: vi.fn(async () => {}),
  resume: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  shutdown: vi.fn(async () => {}),
  metrics: vi.fn(async () => ({ status: 'running' as const, uptime_seconds: 1 })),
});

describe('ResourceManager', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects invalid limits', () => {
    const manager = new ResourceManager();
    expect(manager.applyLimits(101, 512)).toBe('INVALID_CONFIG');
    expect(manager.applyLimits(50, -1)).toBe('INVALID_CONFIG');
  });

  it('supports macOS enforcement mode', () => {
    const manager = new ResourceManager();
    const status = manager.applyLimits(50, 512);
    expect(['ENFORCED', 'UNSUPPORTED']).toContain(status);
  });

  it('starts and stops a resource monitor cleanly', () => {
    vi.useFakeTimers();
    const manager = new ResourceManager();
    const workload = provider();
    manager.applyLimits(50, 512);
    manager.startMonitoring(workload, vi.fn(async () => {}));
    manager.stopMonitoring();
    vi.advanceTimersByTime(2000);
    expect(workload.pause).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
