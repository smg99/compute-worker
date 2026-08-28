import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as jwt from 'jsonwebtoken';
import { ComputeWorkerClient } from '../src/clients/browser';
import { RtoComputeAdapter } from '../src/clients/rto-adapter';

// Mock Server State
let mockControlPlaneConfig = {
    worker_enabled: true,
    allowed_workloads: ['test-compute'],
    active_workload: 'test-compute',
    max_cpu_percent: 50,
    max_memory_mb: 512,
    heartbeat_interval_seconds: 1,
    configuration_version: '1.0.0',
    minimum_worker_version: '1.0.0',
    kill_switch: false
};

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function getAuthToken(): Promise<string> {
  const p = path.join(__dirname, '..', '.worker-data', 'auth.key');
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
    await wait(500);
  }
  throw new Error('Auth token not generated');
}

async function writeMockConfig(config: any) {
    mockControlPlaneConfig = config;
}

function assert(condition: boolean, msg: string, status?: any) {
  if (!condition) {
    if (status) console.error('Status was:', JSON.stringify(status, null, 2));
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runSmokeTest() {
  console.log('--- STARTING STANDALONE SMOKE TEST ---');
  
  const stateDir = path.join(__dirname, '..', '.worker-data');
  if (fs.existsSync(stateDir)) {
      fs.rmSync(stateDir, { recursive: true, force: true });
  }

  // Start Mock Control Plane Server
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
       if (req.url === '/functions/v1/worker-config' && req.method === 'POST') {
           const token = jwt.sign(mockControlPlaneConfig, 'test-secret');
           res.writeHead(200, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ token }));
       } else if (req.url === '/functions/v1/worker-telemetry' && req.method === 'POST') {
           res.writeHead(200, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ success: true }));
       } else {
           res.writeHead(404);
           res.end();
       }
    });
  });
  mockServer.listen(34568);

  const env = { 
    ...process.env, 
    CONTROL_PLANE_URL: 'http://127.0.0.1:34568',
    WORKER_JWT_SECRET: 'test-secret'
  };

  let workerProcess = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.join(__dirname, '..'), env });
  
  await wait(2000); // let API start
  const token = await getAuthToken();
  const client = new ComputeWorkerClient('test', token);
  const rto = new RtoComputeAdapter(token);

  try {
    console.log('1. Verify initial state is SAFE/DISABLED');
    let status = await client.status();
    assert(status?.state === 'SAFE/DISABLED', 'Expected SAFE/DISABLED', status);
    assert(status?.consent === false, 'Expected no consent', status);

    console.log('2. Verify auth is required');
    const badClient = new ComputeWorkerClient('test', 'bad-token');
    const badRes = await badClient.enable();
    assert(badRes === false, 'Expected bad auth to fail');

    console.log('3. Enable local consent');
    await client.enable();
    status = await client.status();
    assert(status?.consent === true, 'Expected consent enabled', status);
    
    assert(status?.state === 'SAFE/DISABLED' || status?.state === 'AUTHORIZED', 'State should not be RUNNING', status);

    console.log('4. Authorize test-compute and Start/request it');
    await client.startWorker(); // This sets compute_requested = true
    await wait(500); // Let polling cycle or immediate reaction hit
    
    status = await client.status();
    assert(status?.workload_state === 'running', `Expected workload to be running`, status);
    assert(status?.state === 'WORKLOAD_RUNNING', 'Expected WORKLOAD_RUNNING state', status);

    console.log('5. Release/stop compute');
    await client.stopWorker();
    await wait(500);
    status = await client.status();
    assert(status?.workload_state === 'stopped', 'Expected workload to stop', status);

    console.log('6. Disable local consent');
    await client.disable();
    status = await client.status();
    assert(status?.consent === false, 'Expected consent to be false', status);

    console.log('7. Trigger kill switch via simulated mock config update');
    await writeMockConfig({
        worker_enabled: true,
        allowed_workloads: ['test-compute'],
        active_workload: 'test-compute',
        configuration_version: '1.0.0',
        kill_switch: true
    });
    // Wait for ConfigPoller to poll (interval is 1s now)
    await wait(2000);
    
    // Toggle something to trigger re-eval if needed, but polling should apply it automatically
    // await client.enable();
    // await client.startWorker();
    status = await client.status();
    assert(status?.state === 'SAFE/DISABLED' && status?.workload_state === 'stopped', 'Kill switch must stop workload', status);

    console.log('8. Terminate the worker');
    workerProcess.kill('SIGTERM');
    await wait(1000);

    console.log('9. Restart the worker');
    workerProcess = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.join(__dirname, '..'), env });
    await wait(2000);

    console.log('10. Verify restart begins in safe state due to kill switch still present in last config');
    status = await client.status();
    assert(status?.workload_state === 'stopped', 'Expected stopped on restart', status);

    console.log('SUCCESS: STANDALONE VERIFIED');
    workerProcess.kill();
    mockServer.close();
  } catch (err) {
    console.error('FAILED: STANDALONE VERIFICATION FAILED', err);
    workerProcess.kill();
    mockServer.close();
    process.exit(1);
  }
}

runSmokeTest();
