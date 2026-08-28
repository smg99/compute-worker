import { OcrComputeProvider } from './providers/ocr-compute';
import { TestComputeProvider } from './providers/test-compute';
import { WorkloadProvider } from './core/workload-provider';

type RpcRequest = { id: number; method: string; args?: any[] };

export async function runWorkloadChild(): Promise<void> {
  const providers: Record<string, WorkloadProvider> = {
    'test-compute': new TestComputeProvider(),
    'ocr-compute': new OcrComputeProvider(),
  };
  const providerId = process.env.COMPUTE_WORKLOAD_ID || '';
  const provider = providers[providerId];

  if (!provider) {
    process.send?.({ type: 'error', error: `Unknown workload: ${providerId}` });
    process.exit(1);
    return;
  }

  async function handle(request: RpcRequest): Promise<void> {
    try {
      const method = request.method as keyof WorkloadProvider;
      const fn = provider[method];
      if (typeof fn !== 'function') throw new Error(`Unsupported workload method: ${request.method}`);
      const result = await (fn as (...args: any[]) => Promise<any>).apply(provider, request.args || []);
      process.send?.({ id: request.id, ok: true, result });
    } catch (error) {
      process.send?.({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  process.on('message', (request: RpcRequest) => { void handle(request); });
  process.on('disconnect', async () => {
    try { await provider.shutdown(); } finally { process.exit(0); }
  });
  process.send?.({ type: 'ready', workload: providerId });
}
