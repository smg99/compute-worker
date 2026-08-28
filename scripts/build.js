const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');

async function build() {
  const dist = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(dist)) fs.mkdirSync(dist);

  // 1. Build the Node.js daemon
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/worker.js',
    minify: true,
    define: { 'process.env.WORKER_VERSION': JSON.stringify(pkg.version) },
    external: ['fsevents'] // Ignore optional dependencies
  });
  console.log('Built dist/worker.js');

  // 2. Build the browser SDK bundle
  await esbuild.build({
    entryPoints: ['src/clients/browser/index.ts'],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    outfile: 'dist/compute-sdk.js',
    globalName: 'ComputeSDK',
    minify: true
  });
  console.log('Built dist/compute-sdk.js');
}

build().catch(console.error);
