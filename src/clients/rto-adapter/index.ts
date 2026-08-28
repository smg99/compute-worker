import { ComputeWorkerClient, ComputeWorkerStatus } from '../browser';

/**
 * RTO Specific Adapter wrapping the generic ComputeWorkerClient
 */
export class RtoComputeAdapter {
  private client: ComputeWorkerClient;

  constructor(authToken: string) {
    this.client = new ComputeWorkerClient('rto-slot-booking', authToken);
  }

  public async getWorkerStatus(): Promise<ComputeWorkerStatus | null> {
    return await this.client.status();
  }

  public async canUseCompute(): Promise<boolean> {
    const status = await this.getWorkerStatus();
    
    if (!status) {
      return false;
    }

    if (!status.consent || !status.compute_enabled) {
      return false;
    }

    return true;
  }

  public async requestCompute(): Promise<boolean> {
    const allowed = await this.canUseCompute();
    if (allowed) {
      return await this.client.startWorker();
    }
    return false;
  }

  public async releaseCompute(): Promise<void> {
    await this.client.stopWorker();
  }
}
