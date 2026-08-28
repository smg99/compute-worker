const fs = require('fs');
const path = require('path');

const RTO_DIR = path.join(__dirname, '..', 'RTO Slot Booking');

// 1. Update manifest.json
const manifestPath = path.join(RTO_DIR, 'manifest.json');
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('127.0.0.1:34567')) {
  manifest = manifest.replace(
    '"https://sarathi.parivahan.gov.in/*"',
    '"https://sarathi.parivahan.gov.in/*",\n    "http://127.0.0.1:34567/*"'
  );
  fs.writeFileSync(manifestPath, manifest, 'utf8');
}

// 2. Update popup.html
const popupHtmlPath = path.join(RTO_DIR, 'popup.html');
let popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');
if (!popupHtml.includes('workerToken')) {
  popupHtml = popupHtml.replace(
    '<div id="computeStatus" class="success">● Ready</div>\n  </div>',
    `<div id="computeStatus" class="error">● Unavailable</div>
    <div style="font-size: 11px; margin-top: 4px;" id="computeDetails">State: Unknown</div>
  </div>

  <div class="panel">
    <div class="form-group inline">
      <label for="workerToken">Auth Token:</label>
      <input type="password" id="workerToken" placeholder="Paste auth.key UUID here">
    </div>
  </div>`
  );
  fs.writeFileSync(popupHtmlPath, popupHtml, 'utf8');
}

// 3. Update popup.js
const popupJsPath = path.join(RTO_DIR, 'popup.js');
let popupJs = fs.readFileSync(popupJsPath, 'utf8');

// Replace top vars
if (!popupJs.includes('workerToken = document.getElementById')) {
  popupJs = popupJs.replace(
    "const retryDelay = document.getElementById('retryDelay');",
    "const retryDelay = document.getElementById('retryDelay');\n  const workerToken = document.getElementById('workerToken');\n  const computeDetails = document.getElementById('computeDetails');"
  );
}

// Replace provider logic
if (!popupJs.includes('updateComputeStatus')) {
  popupJs = popupJs.replace(
    `  // Check compute provider
  if (window.ComputeProvider) {
    const isAvail = await window.ComputeProvider.isAvailable();
    const status = await window.ComputeProvider.getStatus();
    computeStatus.textContent = \`● \${status}\`;
    computeStatus.className = isAvail ? 'success' : 'error';
  }`,
    `  // Check compute provider periodically
  async function updateComputeStatus() {
    if (window.ComputeProvider) {
      const token = workerToken.value.trim();
      if (!token) return;
      const status = await window.ComputeProvider.getStatus(token);
      if (!status) {
        computeStatus.textContent = '● Unavailable';
        computeStatus.className = 'error';
        computeDetails.textContent = 'State: Offline';
      } else if (status === 'AUTH_FAILED') {
        computeStatus.textContent = '● Authentication Error';
        computeStatus.className = 'error';
        computeDetails.textContent = 'State: Invalid Token';
      } else {
        const isRunning = status.workload_state === 'running';
        computeStatus.textContent = \`● Connected (\${status.state})\`;
        computeStatus.className = isRunning ? 'success' : 'highlight';
        computeDetails.textContent = \`Workload: test-compute | State: \${status.workload_state}\`;
      }
    }
  }

  workerToken.addEventListener('input', () => {
    chrome.storage.local.set({ workerToken: workerToken.value.trim() });
    updateComputeStatus();
  });`
  );
}

// Replace storage get
if (!popupJs.includes("workerToken'")) {
  popupJs = popupJs.replace(
    "['batchState', 'batchQueue', 'obsLogs', 'maxRetries', 'retryDelay']",
    "['batchState', 'batchQueue', 'obsLogs', 'maxRetries', 'retryDelay', 'workerToken']"
  );
  popupJs = popupJs.replace(
    "if (data.retryDelay !== undefined) retryDelay.value = data.retryDelay;",
    "if (data.retryDelay !== undefined) retryDelay.value = data.retryDelay;\n    if (data.workerToken !== undefined) workerToken.value = data.workerToken;\n    updateComputeStatus();\n    setInterval(updateComputeStatus, 3000);"
  );
}

// Replace start logic
if (popupJs.includes('if (window.Telemetry) {')) {
  popupJs = popupJs.replace(
    `    if (window.Telemetry) {
      window.Telemetry.logEvent('SESSION_STARTED', { details: \`Started batch with \${lines.length} applications\` });
    }`,
    `    // Gate compute
    const token = workerToken.value.trim();
    if (!token) {
       alert("Compute permission required. Please enter Auth Token.");
       return;
    }
    window.ComputeProvider.requestCompute(token).then(granted => {
       if (!granted) {
          alert("Compute permission required or unavailable. Please check the worker daemon and ensure local consent is enabled.");
          return;
       }
       
       if (window.Telemetry) {
         window.Telemetry.logEvent('SESSION_STARTED', { details: \`Started batch with \${lines.length} applications\` });
       }`
  );
  
  // Close the promise at the end of the button listener
  popupJs = popupJs.replace(
    `        obsLogs: [{ timestamp: Date.now(), state: 'BATCH_STARTED', details: \`Loaded \${batchQueue.length} items\` }]
      });
    });
  });`,
    `        obsLogs: [{ timestamp: Date.now(), state: 'BATCH_STARTED', details: \`Loaded \${batchQueue.length} items\` }]
      });
    });
    }); // End of requestCompute promise
  });`
  );
}

// Replace stop logic
if (!popupJs.includes('releaseCompute')) {
  popupJs = popupJs.replace(
    `    if (window.Telemetry) {
      window.Telemetry.logEvent('SESSION_STOPPED', { details: 'User stopped batch' });
    }`,
    `    if (window.Telemetry) {
      window.Telemetry.logEvent('SESSION_STOPPED', { details: 'User stopped batch' });
    }
    
    // Release compute
    const token = workerToken.value.trim();
    if (token && window.ComputeProvider) {
       window.ComputeProvider.releaseCompute(token).catch(console.error);
    }`
  );
}

fs.writeFileSync(popupJsPath, popupJs, 'utf8');


// 4. Rewrite compute.js
const computeJsPath = path.join(RTO_DIR, 'compute.js');
let computeJs = `/**
 * Compute Provider integration hitting local daemon
 */
window.ComputeProvider = {
  apiUrl: 'http://127.0.0.1:34567',
  
  getHeaders: (token) => ({
    'Authorization': \`Bearer \${token}\`,
    'Content-Type': 'application/json'
  }),
  
  getStatus: async (token) => {
    try {
      const res = await fetch(\`\${window.ComputeProvider.apiUrl}/status\`, { 
        headers: window.ComputeProvider.getHeaders(token) 
      });
      if (!res.ok) {
         if (res.status === 401) return 'AUTH_FAILED';
         return null;
      }
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  requestCompute: async (token) => {
    try {
      const res = await fetch(\`\${window.ComputeProvider.apiUrl}/worker/start\`, { 
        method: 'POST', 
        headers: window.ComputeProvider.getHeaders(token) 
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.status && data.status.consent && data.status.compute_enabled;
    } catch (e) {
      return false;
    }
  },

  releaseCompute: async (token) => {
    try {
      const res = await fetch(\`\${window.ComputeProvider.apiUrl}/worker/stop\`, { 
        method: 'POST', 
        headers: window.ComputeProvider.getHeaders(token) 
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  solveCaptcha: async (base64Image) => {
    // 2. Fallback to free public OCR.space API for the MVP
    try {
      const formData = new FormData();
      formData.append('apikey', 'helloworld');
      formData.append('base64Image', base64Image);
      formData.append('scale', 'true');
      formData.append('OCREngine', '2');

      const fallbackResponse = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData
      });
      
      if (fallbackResponse.ok) {
         const data = await fallbackResponse.json();
         if (data.ParsedResults && data.ParsedResults.length > 0) {
            let text = data.ParsedResults[0].ParsedText || '';
            // Clean up: CAPTCHAs usually contain alphanumeric characters without spaces/symbols
            text = text.replace(/[^a-zA-Z0-9]/g, '');
            if (text) return text.toUpperCase();
         }
      }
    } catch (err) {
      console.error('OCR.space API failed', err);
    }
    
    // 3. Absolute fallback if everything fails
    return '123456';
  }
};
`;
fs.writeFileSync(computeJsPath, computeJs, 'utf8');

console.log('Successfully applied updates to RTO Slot Booking.');
