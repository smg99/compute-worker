const fs = require('fs');
const path = require('path');

const RTO_DIR = path.join(__dirname, '..', 'RTO Slot Booking');
const bgJsPath = path.join(RTO_DIR, 'background.js');
const popupJsPath = path.join(RTO_DIR, 'popup.js');

// 1. Add polling to background.js
let bgJs = fs.readFileSync(bgJsPath, 'utf8');
const pollingCode = `

// --- COMPUTE WORKER SAFETY NET --- //
setInterval(async () => {
   const data = await chrome.storage.local.get(['workerToken', 'batchState', 'obsLogs']);
   const state = data.batchState;
   if (!state || state.status === 'STOPPED' || state.status === 'BATCH_COMPLETE' || state.status === 'IDLE') return;
   
   const token = data.workerToken;
   if (!token) return;
   
   try {
     const res = await fetch('http://127.0.0.1:34567/status', {
        headers: { 'Authorization': \`Bearer \${token}\` }
     });
     if (!res.ok) throw new Error('Bad status');
     const statusData = await res.json();
     if (statusData.workload_state !== 'running') {
        console.warn('Worker offline or kill-switch triggered. Stopping batch.');
        updateBatchState({ status: 'STOPPED' });
        const logs = data.obsLogs || [];
        logs.push({ timestamp: Date.now(), state: 'STOPPED', details: 'Compute Worker kill-switch activated' });
        chrome.storage.local.set({ obsLogs: logs, observing: false });
     }
   } catch(e) {
      console.warn('Worker disconnected. Stopping batch.');
      updateBatchState({ status: 'STOPPED' });
      chrome.storage.local.set({ observing: false });
   }
}, 3000);
`;

if (!bgJs.includes('COMPUTE WORKER SAFETY NET')) {
  bgJs += pollingCode;
  fs.writeFileSync(bgJsPath, bgJs, 'utf8');
  console.log('Updated background.js');
}

// 2. Remove automatic stopBatchBtn click from popup.js
let popupJs = fs.readFileSync(popupJsPath, 'utf8');
const toRemove = `        // Safety switch: if compute stops during a batch, stop the batch automatically
        if (!isRunning && progressView.style.display === 'block') {
           console.log('Compute Worker stopped! Halting batch.');
           stopBatchBtn.click();
           alert('Compute Worker disconnected or kill switch activated. RTO automation has been safely halted.');
        }`;

if (popupJs.includes(toRemove)) {
  popupJs = popupJs.replace(toRemove, '');
  fs.writeFileSync(popupJsPath, popupJs, 'utf8');
  console.log('Updated popup.js');
}
