/**
 * Resource manager for the local worker process.
 *
 * macOS/Node does not expose a portable hard CPU cap for an in-process
 * workload. We therefore enforce a workload-level CPU duty-cycle limit by
 * pausing/resuming the active provider, and enforce memory as a hard safety
 * stop when the worker RSS exceeds the configured ceiling.
 *
 * This is intentionally fail-safe: if resource inspection fails, the manager
 * does not grant extra compute; it leaves the workload running and reports
 * the inspection failure for telemetry/logging.
 */

import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { WorkloadProvider } from './workload-provider';

const execFileAsync = promisify(execFile);
const MONITOR_INTERVAL_MS = 1000;
const CPU_TOLERANCE_PERCENT = 5;
const CPU_PAUSE_MS = 300;

export type ResourceManagerStatus =
  | 'INACTIVE'
  | 'ENFORCED'
  | 'UNSUPPORTED'
  | 'INVALID_CONFIG'
  | 'INSPECTION_ERROR';

export interface ResourceUsage {
  cpu_percent: number;
  memory_mb: number;
}

export class ResourceManager {
  private maxCpuPercent = 0;
  private maxMemoryMb = 0;
  private monitor: NodeJS.Timeout | null = null;
  private provider: WorkloadProvider | null = null;
  private onResourceViolation: (() => Promise<void>) | null = null;
  private pausedForCpu = false;
  private monitoredPid = process.pid;
  private lastUsage: ResourceUsage = { cpu_percent: 0, memory_mb: 0 };
  private _status: ResourceManagerStatus = 'INACTIVE';

  public applyLimits(maxCpuPercent?: number, maxMemoryMb?: number): ResourceManagerStatus {
    this.stopMonitoring();

    const cpu = Number(maxCpuPercent ?? 0);
    const memory = Number(maxMemoryMb ?? 0);

    if (!Number.isFinite(cpu) || !Number.isFinite(memory) || cpu < 0 || cpu > 100 || memory < 0) {
      this._status = 'INVALID_CONFIG';
      return this._status;
    }

    this.maxCpuPercent = cpu;
    this.maxMemoryMb = memory;

    if (cpu === 0 && memory === 0) {
      this._status = 'INACTIVE';
      return this._status;
    }

    if (os.platform() !== 'darwin') {
      this._status = os.platform() === 'linux' || os.platform() === 'win32' ? 'UNSUPPORTED' : 'UNSUPPORTED';
      return this._status;
    }

    this._status = 'ENFORCED';
    return this._status;
  }

  public startMonitoring(
    provider: WorkloadProvider,
    onResourceViolation: () => Promise<void>,
    monitoredPid?: number
  ): ResourceManagerStatus {
    this.provider = provider;
    this.onResourceViolation = onResourceViolation;
    this.monitoredPid = monitoredPid ?? process.pid;

    if (this._status !== 'ENFORCED') return this._status;

    this.monitor = setInterval(() => {
      void this.enforce();
    }, MONITOR_INTERVAL_MS);
    void this.enforce();
    return this._status;
  }

  public stopMonitoring(): void {
    if (this.monitor) {
      clearInterval(this.monitor);
      this.monitor = null;
    }
    this.provider = null;
    this.onResourceViolation = null;
    this.pausedForCpu = false;
  }

  public getStatus(): ResourceManagerStatus {
    return this._status;
  }

  public getLastUsage(): ResourceUsage {
    return { ...this.lastUsage };
  }

  private async enforce(): Promise<void> {
    if (!this.provider || this._status !== 'ENFORCED') return;

    try {
      const usage = await this.readUsage();
      this.lastUsage = usage;

      if (this.maxMemoryMb > 0 && usage.memory_mb > this.maxMemoryMb) {
        console.error(
          `[ResourceManager] Memory limit exceeded: ${usage.memory_mb}MB > ${this.maxMemoryMb}MB. Stopping workload.`
        );
        await this.onResourceViolation?.();
        this.stopMonitoring();
        return;
      }

      if (this.maxCpuPercent > 0 && usage.cpu_percent > this.maxCpuPercent + CPU_TOLERANCE_PERCENT) {
        if (!this.pausedForCpu) {
          this.pausedForCpu = true;
          await this.provider.pause();
          setTimeout(() => {
            void this.resumeAfterCpuPause();
          }, CPU_PAUSE_MS);
        }
      }
    } catch (error) {
      this._status = 'INSPECTION_ERROR';
      console.error('[ResourceManager] Resource inspection failed; stopping workload:', error);
      await this.onResourceViolation?.();
      this.stopMonitoring();
    }
  }

  private async resumeAfterCpuPause(): Promise<void> {
    if (!this.provider || !this.pausedForCpu) return;
    try {
      await this.provider.resume();
    } finally {
      this.pausedForCpu = false;
    }
  }

  private async readUsage(): Promise<ResourceUsage> {
    const { stdout } = await execFileAsync('ps', ['-p', String(this.monitoredPid), '-o', '%cpu=,rss=']);
    const values = stdout.trim().split(/\s+/).map(Number);
    if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
      throw new Error(`Unexpected ps output: ${stdout.trim()}`);
    }
    return {
      cpu_percent: values[0]!,
      memory_mb: values[1]! / 1024,
    };
  }
}
