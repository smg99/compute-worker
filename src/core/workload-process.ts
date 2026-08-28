import { ChildProcess, fork } from 'child_process';
import * as path from 'path';
import * as sea from 'node:sea';
import { WorkloadConfiguration, WorkloadMetrics, WorkloadProvider } from './workload-provider';

type RpcRequest = { id: number; method: string; args?: any[] };
type RpcResponse = { id: number; ok: boolean; result?: any; error?: string };

export class WorkloadProcessProvider implements WorkloadProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly version: string;
  public readonly description: string;
  public readonly capabilities: string[];
  public readonly resource_requirements: any;
  public readonly supported_platforms: string[];

  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private intentionalShutdown = false;
  private exitHandler: ((error: Error) => void) | null = null;

  constructor(private readonly providerId: string, metadata: WorkloadProvider) {
    this.id = metadata.id;
    this.name = metadata.name;
    this.version = metadata.version;
    this.description = metadata.description;
    this.capabilities = metadata.capabilities;
    this.resource_requirements = metadata.resource_requirements;
    this.supported_platforms = metadata.supported_platforms;
    if (this.id !== providerId) throw new Error(`Provider id mismatch: ${providerId}`);
  }

  public onUnexpectedExit(handler: (error: Error) => void): void { this.exitHandler = handler; }

  public get processId(): number | null {
    return this.child?.pid ?? null;
  }

  public async initialize(): Promise<void> {
    await this.ensureChild();
    await this.call('initialize');
  }

  public async start(config: WorkloadConfiguration): Promise<void> {
    await this.ensureChild();
    await this.call('start', [config]);
  }

  public async pause(): Promise<void> { await this.call('pause'); }
  public async resume(): Promise<void> { await this.call('resume'); }
  public async stop(): Promise<void> {
    if (!this.child) return;
    this.intentionalShutdown = true;
    try { await this.call('stop'); } finally { await this.shutdownProcess(); }
  }

  public async shutdown(): Promise<void> {
    if (!this.child) return;
    this.intentionalShutdown = true;
    try { await this.call('shutdown'); } catch { /* child may already be exiting */ }
    await this.shutdownProcess();
  }

  public async executeTask(payload: any): Promise<any> {
    return this.call('executeTask', [payload]);
  }

  public async metrics(): Promise<WorkloadMetrics> {
    return this.call('metrics');
  }

  private async ensureChild(): Promise<void> {
    if (this.child && !this.child.killed) return;
    const workerScript = path.resolve(process.argv[1]);
    // SEA binaries have no external JS entrypoint. Re-launch the executable itself;
    // the embedded entrypoint sees COMPUTE_WORKER_CHILD and enters workload-child mode.
    const child = sea.isSea()
      ? fork(process.execPath, [], {
          env: { ...process.env, COMPUTE_WORKER_CHILD: '1', COMPUTE_WORKLOAD_ID: this.id },
          stdio: ['ignore', 'pipe', 'pipe', 'ipc']
        })
      : fork(workerScript, [], {
      env: { ...process.env, COMPUTE_WORKER_CHILD: '1', COMPUTE_WORKLOAD_ID: this.id },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    this.child = child;
    this.intentionalShutdown = false;
    child.stdout?.on('data', data => console.log(`[Workload:${this.id}] ${data}`));
    child.stderr?.on('data', data => console.error(`[Workload:${this.id}] ${data}`));
    child.on('message', (message: RpcResponse) => this.handleResponse(message));
    child.on('exit', (code, signal) => {
      const error = new Error(`Workload process exited (code=${code}, signal=${signal})`);
      const unexpected = !this.intentionalShutdown;
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
      if (this.child === child) this.child = null;
      if (unexpected) this.exitHandler?.(error);
      this.intentionalShutdown = false;
    });
    await new Promise<void>((resolve, reject) => {
      const onMessage = (message: any) => {
        if (message?.type === 'ready') { cleanup(); resolve(); }
      };
      const onExit = () => { cleanup(); reject(new Error(`Workload process failed to initialize`)); };
      const cleanup = () => { child.off('message', onMessage); child.off('exit', onExit); };
      child.on('message', onMessage);
      child.once('exit', onExit);
    });
  }

  private call(method: string, args: any[] = []): Promise<any> {
    if (!this.child || !this.child.connected) return Promise.reject(new Error(`Workload ${this.id} is not running`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child!.send({ id, method, args } satisfies RpcRequest, error => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private handleResponse(message: RpcResponse): void {
    if (!message || typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error || 'Workload RPC failed'));
  }

  private async shutdownProcess(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;
    if (child.connected) child.disconnect();
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { if (!child.killed) child.kill('SIGTERM'); resolve(); }, 1000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
