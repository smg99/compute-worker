const fs = require('fs');
const path = require('path');

const RTO_DIR = path.join(__dirname, '..', 'RTO Slot Booking');
const popupJsPath = path.join(RTO_DIR, 'popup.js');

let popupJs = fs.readFileSync(popupJsPath, 'utf8');

const targetStr = `        computeDetails.textContent = \`Workload: test-compute | State: \${status.workload_state}\`;
      }`;

const replaceStr = `        computeDetails.textContent = \`Workload: test-compute | State: \${status.workload_state}\`;
        
        // Safety switch: if compute stops during a batch, stop the batch automatically
        if (!isRunning && progressView.style.display === 'block') {
           console.log('Compute Worker stopped! Halting batch.');
           stopBatchBtn.click();
           alert('Compute Worker disconnected or kill switch activated. RTO automation has been safely halted.');
        }
      }`;

if (popupJs.includes(targetStr) && !popupJs.includes('stopBatchBtn.click()')) {
  popupJs = popupJs.replace(targetStr, replaceStr);
  fs.writeFileSync(popupJsPath, popupJs, 'utf8');
  console.log('Added kill-switch detection to popup.js');
} else {
  console.log('Target string not found or already patched.');
}
