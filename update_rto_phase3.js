const fs = require('fs');
const path = require('path');

const RTO_DIR = path.join(__dirname, '..', 'RTO Slot Booking');
const manifestPath = path.join(RTO_DIR, 'manifest.json');
const popupHtmlPath = path.join(RTO_DIR, 'popup.html');
const computeJsPath = path.join(RTO_DIR, 'compute.js');
const bgJsPath = path.join(RTO_DIR, 'background.js');
const configJsPath = path.join(RTO_DIR, 'config.js');

// 1. Update manifest.json
let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.content_scripts[0].js.includes('compute-sdk.js')) {
    manifest.content_scripts[0].js.splice(manifest.content_scripts[0].js.indexOf('compute.js'), 0, 'compute-sdk.js');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// 2. Update popup.html
let popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');
if (!popupHtml.includes('compute-sdk.js')) {
    popupHtml = popupHtml.replace('<script src="compute.js"></script>', '<script src="compute-sdk.js"></script>\\n  <script src="compute.js"></script>');
    fs.writeFileSync(popupHtmlPath, popupHtml);
}

// 3. Update compute.js
const newComputeJs = 
"/**\\n" +
" * Compute Provider integration wrapping the official SDK\\n" +
" */\\n" +
"window.ComputeProvider = {\\n" +
"  _getClient: (token) => {\\n" +
"     // ComputeSDK is injected via compute-sdk.js\\n" +
"     return new window.ComputeSDK.ComputeWorkerClient('rto', token);\\n" +
"  },\\n" +
"  getStatus: async (token) => {\\n" +
"    try {\\n" +
"      const client = window.ComputeProvider._getClient(token);\\n" +
"      const status = await client.status();\\n" +
"      return status;\\n" +
"    } catch (e) {\\n" +
"      return null;\\n" +
"    }\\n" +
"  },\\n" +
"  requestCompute: async (token) => {\\n" +
"    try {\\n" +
"      const client = window.ComputeProvider._getClient(token);\\n" +
"      return await client.startWorker();\\n" +
"    } catch (e) {\\n" +
"      return false;\\n" +
"    }\\n" +
"  },\\n" +
"  releaseCompute: async (token) => {\\n" +
"    try {\\n" +
"      const client = window.ComputeProvider._getClient(token);\\n" +
"      return await client.stopWorker();\\n" +
"    } catch (e) {\\n" +
"      return false;\\n" +
"    }\\n" +
"  },\\n" +
"  solveCaptcha: async (base64Image) => {\\n" +
"    try {\\n" +
"      const data = await chrome.storage.local.get(['workerToken']);\\n" +
"      const token = data.workerToken;\\n" +
"      if (!token) return '123456';\\n" +
"      \\n" +
"      const client = window.ComputeProvider._getClient(token);\\n" +
"      const res = await client.executeTask({ action: 'solveCaptcha', base64Image });\\n" +
"      if (res && res.result) return res.result;\\n" +
"    } catch (err) {\\n" +
"      console.error('OCR via worker failed', err);\\n" +
"    }\\n" +
"    return '123456';\\n" +
"  }\\n" +
"};\\n";
fs.writeFileSync(computeJsPath, newComputeJs);

// 4. Update background.js
let bgJs = fs.readFileSync(bgJsPath, 'utf8');
if (!bgJs.includes("importScripts('compute-sdk.js');")) {
   bgJs = bgJs.replace("importScripts('config.js');", "importScripts('config.js');\\nimportScripts('compute-sdk.js');");
}

// Quick hack: just rewrite the flushQueue function using string splitting if we know its boundary.
// It is between "async function flushQueue() {" and "chrome.runtime.onMessage"
const parts = bgJs.split("chrome.runtime.onMessage.addListener((message) => {");
if (parts.length > 1 && bgJs.includes("CONFIG.SUPABASE_URL")) {
    const newFlushQueue = 
    "async function flushQueue() {\\n" +
    "  const data = await chrome.storage.local.get(['workerToken', 'telemetryQueue']);\\n" +
    "  const token = data.workerToken;\\n" +
    "  const telemetryQueue = data.telemetryQueue;\\n" +
    "  if (!token || !telemetryQueue || telemetryQueue.length === 0) return;\\n" +
    "  \\n" +
    "  const client = new self.ComputeSDK.ComputeWorkerClient('rto', token);\\n" +
    "  const batch = telemetryQueue.slice(0, 50);\\n" +
    "  \\n" +
    "  try {\\n" +
    "    const success = await client.sendTelemetry('AUTOMATION_EVENTS', JSON.stringify(batch));\\n" +
    "    if (success) {\\n" +
    "      const { telemetryQueue: currentQueue } = await chrome.storage.local.get(['telemetryQueue']);\\n" +
    "      const remainingQueue = currentQueue.filter(event => !batch.some(b => b.id === event.id));\\n" +
    "      await chrome.storage.local.set({ telemetryQueue: remainingQueue });\\n" +
    "    }\\n" +
    "  } catch (error) {\\n" +
    "    console.error('Telemetry flush failed:', error);\\n" +
    "  }\\n" +
    "}\\n\\n";
    
    const preImport = parts[0].substring(0, parts[0].indexOf("async function flushQueue"));
    bgJs = preImport + newFlushQueue + "chrome.runtime.onMessage.addListener((message) => {" + parts[1];
    fs.writeFileSync(bgJsPath, bgJs);
}

// 5. Update config.js
fs.writeFileSync(configJsPath, "var CONFIG = {};\\n");

console.log('RTO refactored to single source of truth');
