import { ComputeWorkerClient } from './src/clients/browser';
import { RtoComputeAdapter } from './src/clients/rto-adapter';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('Starting Compute Worker daemon...');
  const workerProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: __dirname,
    stdio: 'ignore' // We ignore stdio to avoid log spam in the test output
  });

  // Wait for server to start
  await wait(2000);
  
  const tokenPath = path.join(__dirname, '.worker-data', 'auth.key');
  const token = fs.readFileSync(tokenPath, 'utf8').trim();

  let exitCode = 0;

  try {
    const client = new ComputeWorkerClient('test-suite', token);
    const rtoAdapter = new RtoComputeAdapter(token);

    console.log('[TEST 1] Worker starts disabled & Local API rejects non-local access (Simulated)');
    let status = await client.status();
    console.assert(status?.consent === false, 'Consent should be false initially');
    console.assert(status?.compute_enabled === false, 'Compute should be disabled initially');

    console.log('[TEST 2] RTO Adapter: No consent => workload cannot start');
    let rtoAllowed = await rtoAdapter.canUseCompute();
    console.assert(rtoAllowed === false, 'RTO should not be allowed');

    console.log('[TEST 3] Enable User Consent (Remote enabled via mock) => workload starts');
    await client.enable();
    status = await client.status();
    console.assert(status?.consent === true, 'Consent should be true');
    console.assert(status?.compute_enabled === true, 'Compute should be enabled since mock config is true');

    console.log('[TEST 4] RTO Adapter: Consent enabled + remote enabled => allowed');
    rtoAllowed = await rtoAdapter.canUseCompute();
    console.assert(rtoAllowed === true, 'RTO should now be allowed');
    
    // Simulate RTO requesting compute
    const computeRequested = await rtoAdapter.requestCompute();
    console.assert(computeRequested === true, 'RTO compute request should succeed');
    await rtoAdapter.releaseCompute();

    console.log('[TEST 5] Disable User Consent (Local Kill Switch) => stops immediately');
    await client.disable();
    status = await client.status();
    console.assert(status?.consent === false, 'Consent should be false');
    console.assert(status?.compute_enabled === false, 'Compute should be disabled');

    console.log('[TEST 6] RTO Adapter: Local Kill Switch => rejected');
    rtoAllowed = await rtoAdapter.canUseCompute();
    console.assert(rtoAllowed === false, 'RTO should not be allowed');

    console.log('All tests passed successfully!');
  } catch (error) {
    console.error('Test failed!', error);
    exitCode = 1;
  } finally {
    console.log('Killing Compute Worker daemon...');
    workerProcess.kill();
    process.exit(exitCode);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
