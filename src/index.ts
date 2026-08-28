import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { WorkerState } from './core/worker-state';
import { WorkerRuntime } from './core/worker-runtime';
import { TestComputeProvider } from './providers/test-compute';
import { OcrComputeProvider } from './providers/ocr-compute';
import { runWorkloadChild } from './workload-child';
import { WorkloadProcessProvider } from './core/workload-process';

if (process.env.COMPUTE_WORKER_CHILD === '1') {
  void runWorkloadChild();
} else {

const PORT = parseInt(process.env.WORKER_PORT || '34567', 10);
const STATE_DIR = process.env.WORKER_STATE_DIR || path.join(require('os').homedir(), '.compute-worker');

// Ensure state dir exists
fs.mkdirSync(STATE_DIR, { recursive: true });

// Read or generate auth token
const AUTH_KEY_PATH = path.join(STATE_DIR, 'auth.key');
let localAuthToken = '';
if (fs.existsSync(AUTH_KEY_PATH)) {
  localAuthToken = fs.readFileSync(AUTH_KEY_PATH, 'utf8').trim();
} else {
  localAuthToken = randomUUID();
  fs.writeFileSync(AUTH_KEY_PATH, localAuthToken, 'utf8');
}

// 1. Initialize State
const state = new WorkerState(STATE_DIR);

// 2. Initialize Runtime
const runtime = new WorkerRuntime(
  state,
  process.env.CONTROL_PLANE_URL || 'https://api.mock-control-plane.com',
  'generic-worker', // root worker
  '1.0.0'
);

// 3. Register Providers
runtime.registerProvider(new WorkloadProcessProvider('test-compute', new TestComputeProvider()));
runtime.registerProvider(new WorkloadProcessProvider('ocr-compute', new OcrComputeProvider()));

// 4. Start Worker
runtime.start();

// 5. Start Local HTTP Server for IPC
const server = http.createServer((req, res) => {
  // Reject non-local requests
  const remoteIp = req.socket.remoteAddress;
  if (remoteIp !== '127.0.0.1' && remoteIp !== '::1' && remoteIp !== '::ffff:127.0.0.1') {
    res.writeHead(403);
    res.end('Forbidden: Localhost only');
    return;
  }

  // CORS for local browser extensions
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const authHeader = req.headers['authorization'];
  const validToken = `Bearer ${localAuthToken}`;
  
  // All endpoints EXCEPT /health and /status are protected
  if (req.url && req.url !== '/health' && req.url !== '/status') {
    if (authHeader !== validToken) {
       res.writeHead(401);
       res.end('Unauthorized');
       return;
    }
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: runtime.getStatus().worker_version }));
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runtime.getStatus()));
    return;
  }

  if (req.method === 'POST' && req.url === '/consent/enable') {
    runtime.enableLocalConsent();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: runtime.getStatus() }));
    return;
  }

  if (req.method === 'POST' && req.url === '/consent/disable') {
    runtime.disableLocalConsent();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: runtime.getStatus() }));
    return;
  }

  if (req.method === 'POST' && req.url === '/worker/start') {
    runtime.requestCompute();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: runtime.getStatus() }));
    return;
  }

  if (req.method === 'POST' && req.url === '/worker/stop') {
    runtime.releaseCompute();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: runtime.getStatus() }));
    return;
  }

  if (req.method === 'GET' && req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state.lastKnownConfig || {}));
    return;
  }

  if (req.method === 'POST' && req.url === '/workload/execute') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const result = await runtime.executeTask(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/telemetry/event') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        runtime.trackTelemetryEvent(payload.type || 'PRODUCT_EVENT', payload.details);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Worker] Local API listening on http://127.0.0.1:${PORT}`);
  console.log(`[Worker] Consent: ${state.hasUserConsent ? 'ENABLED' : 'DISABLED'}`);
  console.log(`[Worker] Auth Token path: ${AUTH_KEY_PATH}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down (SIGTERM)...');
  await runtime.stop();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down (SIGINT)...');
  await runtime.stop();
  server.close();
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err);
  await runtime.stop();
  server.close();
  process.exit(1);
});
}
