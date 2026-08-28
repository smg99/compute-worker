import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

import * as jwt from 'jsonwebtoken';

const CONTROL_PLANE_PORT = parseInt(process.env.CONTROL_PLANE_PORT || `${Math.floor(30000 + Math.random() * 1000)}`, 10);
const WORKER_PORT = process.env.WORKER_PORT || `${Math.floor(30000 + Math.random() * 1000)}`;
const DAEMON_URL = `http://127.0.0.1:${WORKER_PORT}`;

let mockConfig = {
  active_workload: 'test-compute',
  allowed_workloads: ['test-compute', 'ocr-compute'],
  worker_enabled: true,
  kill_switch: false,
  configuration_version: '1.0.0',
  heartbeat_interval_seconds: 60,
  max_cpu_percent: 50,
  max_memory_mb: 512
};

// Mock Control Plane Server
const controlPlane = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url?.startsWith('/functions/v1/worker-config')) {
     const token = jwt.sign(mockConfig, 'test-secret');
     res.writeHead(200, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ token }));
     return;
  }
  if (req.method === 'POST' && req.url?.startsWith('/functions/v1/worker-telemetry')) {
     res.writeHead(200, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ success: true }));
     return;
  }
  res.writeHead(404);
  res.end();
});

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForStatus(predicate: (status: any) => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await (await fetch(`${DAEMON_URL}/status`)).json();
    if (predicate(status)) return status;
    await sleep(200);
  }
  return await (await fetch(`${DAEMON_URL}/status`)).json();
}

async function runTests() {
  console.log('--- STARTING E2E VERIFICATION ---');
  
  const authKeyPath = path.join(process.env.HOME || '', '.compute-worker', 'auth.key');
  const validToken = fs.readFileSync(authKeyPath, 'utf8').trim();

  // Test 1: Phase 6 - Authentication Valid Token
  console.log('\n[Phase 6] Testing Valid Auth Token');
  let res = await fetch(`${DAEMON_URL}/status`, { headers: { 'Authorization': `Bearer ${validToken}` }});
  if (res.status === 200) console.log('  PASS: Valid token accepted');
  else throw new Error('Valid token rejected');

  // Test 2: Phase 6 - Authentication Missing Token
  console.log('[Phase 6] Testing Missing Auth Token');
  res = await fetch(`${DAEMON_URL}/worker/start`, { method: 'POST' });
  if (res.status === 401) console.log('  PASS: Missing token rejected with 401');
  else throw new Error('Missing token allowed');

  // Test 3: Phase 6 - Authentication Invalid Token
  console.log('[Phase 6] Testing Invalid Auth Token');
  res = await fetch(`${DAEMON_URL}/worker/start`, { method: 'POST', headers: { 'Authorization': 'Bearer garbage' }});
  if (res.status === 401) console.log('  PASS: Invalid token rejected with 401');
  else throw new Error('Invalid token allowed');
  
  // Setup: Enable local consent for tests
  await fetch(`${DAEMON_URL}/consent/enable`, { method: 'POST', headers: { 'Authorization': `Bearer ${validToken}` }});
  
  // Test 4: Phase 7 - Consent Matrix (All Valid)
  console.log('\n[Phase 7] Testing Consent Matrix: All Valid');
  mockConfig.worker_enabled = true;
  mockConfig.kill_switch = false;
  await fetch(`${DAEMON_URL}/worker/start`, { method: 'POST', headers: { 'Authorization': `Bearer ${validToken}` }});
  await sleep(1000); 
  let status = await (await fetch(`${DAEMON_URL}/status`, { headers: { 'Authorization': `Bearer ${validToken}` }})).json();
  if (status.workload_state === 'running' && status.state === 'WORKLOAD_RUNNING') {
     if (!status.workload_process_id || status.workload_process_id === status.worker_process_id) {
       throw new Error('Workload is not isolated in a separate process');
     }
     console.log(`  PASS: Workload starts in isolated child process (PID ${status.workload_process_id})`);
  } else {
     throw new Error('Workload failed to start when all conditions met');
  }

  // Test 5: Phase 1C - Workload Crash Recovery
  console.log('[Phase 1C] Testing Workload Crash Recovery');
  const crashedPid = status.workload_process_id;
  if (!crashedPid) throw new Error('Missing workload PID before crash test');
  process.kill(crashedPid, 'SIGKILL');
  status = await waitForStatus(s => s.workload_state === 'running' && s.workload_process_id && s.workload_process_id !== crashedPid, 10000);
  if (status.workload_state === 'running' && status.workload_process_id && status.workload_process_id !== crashedPid) {
    console.log(`  PASS: Workload restarted after crash (PID ${crashedPid} -> ${status.workload_process_id})`);
  } else {
    throw new Error(`Workload failed to recover after crash (PID ${crashedPid})`);
  }

  // Test 6: Phase 7 - Consent Matrix (Kill Switch Activated)
  console.log('[Phase 7] Testing Consent Matrix: Remote Kill Switch');
  mockConfig.kill_switch = true;
  status = await waitForStatus(s => s.state === 'SAFE/DISABLED', 5000);
  if (status.state === 'SAFE/DISABLED') {
     console.log('  PASS: Workload stopped/blocked by kill switch');
  } else {
     throw new Error(`Kill switch failed to stop workload (State: ${status.state})`);
  }
  
  // Test 7: Phase 7 - Consent Matrix (Remote Auth Disabled)
  console.log('[Phase 7] Testing Consent Matrix: Remote Auth Revoked');
  mockConfig.kill_switch = false;
  mockConfig.worker_enabled = false;
  status = await waitForStatus(s => s.state === 'SAFE/DISABLED', 5000);
  if (status.state === 'SAFE/DISABLED') {
     console.log('  PASS: Workload stopped/blocked by remote auth revocation');
  } else {
     throw new Error('Remote auth revocation failed to stop workload');
  }
  
  // Reset
  mockConfig.worker_enabled = true;
  await fetch(`${DAEMON_URL}/consent/disable`, { method: 'POST', headers: { 'Authorization': `Bearer ${validToken}` }});
  await fetch(`${DAEMON_URL}/consent/enable`, { method: 'POST', headers: { 'Authorization': `Bearer ${validToken}` }});

  // Test 8: Phase 4 & 5 - Task Execution & Telemetry Proxy
  console.log('\n[Phase 4] Testing OCR Task Execution');
  mockConfig.worker_enabled = true;
  mockConfig.active_workload = 'ocr-compute';
  await sleep(1500); // wait for poll
  
  res = await fetch(`${DAEMON_URL}/workload/execute`, { 
    method: 'POST', 
    headers: { 'Authorization': `Bearer ${validToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'solveCaptcha', base64Image: 'fake' })
  });
  if (res.status === 200) {
      const data = await res.json();
      if (data.success && data.result === '123456') { 
          console.log('  PASS: Task execution properly delegated to OCR workload');
      } else {
          throw new Error('Task executed but returned unexpected payload: ' + JSON.stringify(data));
      }
  } else {
      throw new Error('Task execution failed: ' + res.status);
  }

  console.log('\n[Phase 5] Testing Telemetry Proxy');
  res = await fetch(`${DAEMON_URL}/telemetry/event`, { 
    method: 'POST', 
    headers: { 'Authorization': `Bearer ${validToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'AUTOMATION_EVENTS', details: '[]' })
  });
  if (res.status === 200) {
      console.log('  PASS: Telemetry proxy accepted event');
  } else {
      throw new Error('Telemetry proxy failed: ' + res.status);
  }

  console.log('\n--- E2E VERIFICATION COMPLETE ---');
}

import { spawn } from 'child_process';

controlPlane.listen(CONTROL_PLANE_PORT, '127.0.0.1', () => {
   const worker = spawn('node', ['dist/worker.js'], {
     env: { ...process.env, CONTROL_PLANE_URL: `http://127.0.0.1:${CONTROL_PLANE_PORT}`, WORKER_JWT_SECRET: 'test-secret', POLL_INTERVAL_MS: '1000', WORKER_PORT: WORKER_PORT }
   });
   
   worker.stdout.on('data', (data) => console.log(`[DAEMON] ${data}`));
   worker.stderr.on('data', (data) => console.error(`[DAEMON] ${data}`));

   setTimeout(() => {
     runTests().then(() => {
       worker.kill();
       controlPlane.close();
       process.exit(0);
     }).catch(e => {
       console.error(e);
       worker.kill();
       controlPlane.close();
       process.exit(1);
     });
   }, 2000); // Wait for daemon to start
});
