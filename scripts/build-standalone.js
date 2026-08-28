const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const platform = process.platform;
const arch = process.arch;
const suffix = platform === 'win32' ? '.exe' : '';
const output = process.env.SEA_OUTPUT || path.join(root, 'dist', `compute-worker-${platform}-${arch}${suffix}`);
const config = path.join(root, 'dist', 'sea-config.json');

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(config, JSON.stringify({
  main: path.join(root, 'dist', 'worker.js'),
  output,
  disableExperimentalSEAWarning: true
}, null, 2));

execFileSync(process.execPath, ['--build-sea', config], { stdio: 'inherit' });
if (platform !== 'win32') fs.chmodSync(output, 0o755);
if (platform === 'darwin') {
  // Ad-hoc signing makes SEA binaries runnable on macOS. Production releases
  // can replace this with Developer ID signing + notarization in CI secrets.
  execFileSync('codesign', ['--force', '--sign', '-', output], { stdio: 'inherit' });
}
fs.rmSync(config, { force: true });
console.log(`Standalone artifact: ${output}`);
