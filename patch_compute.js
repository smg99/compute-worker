const fs = require('fs');
const path = require('path');

const RTO_DIR = path.join(__dirname, '..', 'RTO Slot Booking');
const computeJsPath = path.join(RTO_DIR, 'compute.js');

let computeJs = fs.readFileSync(computeJsPath, 'utf8');

const targetStr = `      const res = await fetch(\`\${window.ComputeProvider.apiUrl}/worker/start\`, { 
        method: 'POST', 
        headers: window.ComputeProvider.getHeaders(token) 
      });`;

const replaceStr = `      const res = await fetch(\`\${window.ComputeProvider.apiUrl}/worker/start\`, { 
        method: 'POST', 
        headers: window.ComputeProvider.getHeaders(token),
        body: JSON.stringify({ product_id: 'rto', workload_id: 'test-compute' })
      });`;

if (computeJs.includes(targetStr)) {
  computeJs = computeJs.replace(targetStr, replaceStr);
  fs.writeFileSync(computeJsPath, computeJs, 'utf8');
  console.log('Added product_id to compute.js');
}
