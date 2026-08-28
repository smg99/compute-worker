/**
 * Shared Generic Browser Client for Compute Worker
 */

export interface ComputeWorkerStatus {
  worker_id: string;
  worker_version: string;
  state: string;
  consent: boolean;
  compute_requested: boolean;
  remote_authorization: boolean;
  kill_switch: boolean;
  active_workload: string;
  workload_state: string;
  resource_manager_status: string;
}

export class ComputeWorkerClient {
  private readonly apiUrl: string;

  constructor(public readonly productId: string, private authToken: string, apiUrl = 'http://127.0.0.1:34567') {
    this.apiUrl = apiUrl.replace(/\/$/, '');
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.authToken}`
    };
  }

  public async status(): Promise<ComputeWorkerStatus | null> {
    try {
      const res = await fetch(`${this.apiUrl}/status`, { headers: this.headers });
      if (!res.ok) throw new Error('Bad response');
      return await res.json();
    } catch (e) {
      // Worker is likely not installed or offline
      return null;
    }
  }

  public async enable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/consent/enable`, { method: 'POST', headers: this.headers });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  public async disable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/consent/disable`, { method: 'POST', headers: this.headers });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  public async startWorker(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/worker/start`, { method: 'POST', headers: this.headers });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  public async stopWorker(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/worker/stop`, { method: 'POST', headers: this.headers });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  public async executeTask(payload: any): Promise<any> {
    try {
      const res = await fetch(`${this.apiUrl}/workload/execute`, { 
        method: 'POST', 
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Bad response');
      return await res.json();
    } catch (e) {
      return { error: e.message || 'Unknown error' };
    }
  }

  public async sendTelemetry(type: string, details?: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/telemetry/event`, { 
        method: 'POST', 
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, details })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }
}
