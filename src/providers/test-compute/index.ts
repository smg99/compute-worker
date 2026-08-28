import { WorkloadProvider, WorkloadConfiguration, WorkloadMetrics } from '../../core/workload-provider';

/**
 * A harmless TEST COMPUTE provider.
 * It simulates a workload by entering a slow CPU loop or just idling deterministically.
 * It does NOT mine cryptocurrency.
 */
export class TestComputeProvider implements WorkloadProvider {
  public readonly id = 'test-compute';
  public readonly name = 'Test Compute Provider';
  public readonly version = '1.0.0';
  public readonly capabilities = ['cpu', 'test'];

  public readonly description = 'A harmless test compute workload';
  public readonly resource_requirements = { cpu: 'minimal' };
  public readonly supported_platforms = ['linux', 'darwin', 'win32'];

  private isRunning = false;
  private isPaused = false;
  private startTime = 0;
  private simulationInterval: NodeJS.Timeout | null = null;
  private loopCount = 0;

  async initialize(): Promise<void> {
    // console.log('TestCompute initialized');
  }

  async start(config: WorkloadConfiguration): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.loopCount = 0;

    // console.log(`[TestCompute] Starting with max CPU %: ${config.max_cpu_percent}`);

    // Simulate work: every 100ms do a tiny amount of deterministic math
    this.simulationInterval = setInterval(() => {
      if (this.isPaused) return;
      let x = 0;
      for (let i = 0; i < 10000; i++) {
        x += Math.sqrt(i);
      }
      this.loopCount++;
    }, 100);
  }

  async pause(): Promise<void> {
    this.isPaused = true;
  }

  async resume(): Promise<void> {
    this.isPaused = false;
  }

  async stop(): Promise<void> {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.isRunning = false;
  }

  async shutdown(): Promise<void> {
    await this.stop();
  }

  async metrics(): Promise<WorkloadMetrics> {
    return {
      status: this.isRunning ? (this.isPaused ? 'paused' : 'running') : 'stopped',
      uptime_seconds: this.isRunning ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      cpu_percent: this.isRunning ? 5 : 0, // Mock CPU usage
      threads: 1,
      loop_count: this.loopCount
    };
  }
}
