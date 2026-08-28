"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/e2e-verification.ts
var http = __toESM(require("http"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var jwt = __toESM(require("jsonwebtoken"));
var import_child_process = require("child_process");
var CONTROL_PLANE_PORT = 34568;
var DAEMON_URL = "http://127.0.0.1:34567";
var mockConfig = {
  active_workload: "test-compute",
  allowed_workloads: ["test-compute", "ocr-compute"],
  worker_enabled: true,
  kill_switch: false,
  configuration_version: "1.0.0",
  heartbeat_interval_seconds: 60,
  max_cpu_percent: 50,
  max_memory_mb: 512
};
var controlPlane = http.createServer((req, res) => {
  if (req.method === "POST" && req.url?.startsWith("/functions/v1/worker-config")) {
    const token = jwt.sign(mockConfig, "test-secret");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ token }));
    return;
  }
  if (req.method === "POST" && req.url?.startsWith("/functions/v1/worker-telemetry")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function runTests() {
  console.log("--- STARTING E2E VERIFICATION ---");
  const authKeyPath = path.join(process.env.HOME || "", ".compute-worker", "auth.key");
  const validToken = fs.readFileSync(authKeyPath, "utf8").trim();
  console.log("\n[Phase 6] Testing Valid Auth Token");
  let res = await fetch(`${DAEMON_URL}/status`, { headers: { "Authorization": `Bearer ${validToken}` } });
  if (res.status === 200) console.log("  PASS: Valid token accepted");
  else throw new Error("Valid token rejected");
  console.log("[Phase 6] Testing Missing Auth Token");
  res = await fetch(`${DAEMON_URL}/worker/start`, { method: "POST" });
  if (res.status === 401) console.log("  PASS: Missing token rejected with 401");
  else throw new Error("Missing token allowed");
  console.log("[Phase 6] Testing Invalid Auth Token");
  res = await fetch(`${DAEMON_URL}/worker/start`, { method: "POST", headers: { "Authorization": "Bearer garbage" } });
  if (res.status === 401) console.log("  PASS: Invalid token rejected with 401");
  else throw new Error("Invalid token allowed");
  await fetch(`${DAEMON_URL}/consent/enable`, { method: "POST", headers: { "Authorization": `Bearer ${validToken}` } });
  console.log("\n[Phase 7] Testing Consent Matrix: All Valid");
  mockConfig.worker_enabled = true;
  mockConfig.kill_switch = false;
  await fetch(`${DAEMON_URL}/worker/start`, { method: "POST", headers: { "Authorization": `Bearer ${validToken}` } });
  await sleep(1e3);
  let status = await (await fetch(`${DAEMON_URL}/status`, { headers: { "Authorization": `Bearer ${validToken}` } })).json();
  if (status.workload_state === "running" && status.state === "WORKLOAD_RUNNING") {
    console.log("  PASS: Workload starts when all conditions are met");
  } else {
    throw new Error("Workload failed to start when all conditions met");
  }
  console.log("[Phase 7] Testing Consent Matrix: Remote Kill Switch");
  mockConfig.kill_switch = true;
  await sleep(1500);
  status = await (await fetch(`${DAEMON_URL}/status`, { headers: { "Authorization": `Bearer ${validToken}` } })).json();
  if (status.state === "SAFE/DISABLED") {
    console.log("  PASS: Workload stopped/blocked by kill switch");
  } else {
    throw new Error(`Kill switch failed to stop workload (State: ${status.state})`);
  }
  console.log("[Phase 7] Testing Consent Matrix: Remote Auth Revoked");
  mockConfig.kill_switch = false;
  mockConfig.worker_enabled = false;
  await sleep(1500);
  status = await (await fetch(`${DAEMON_URL}/status`, { headers: { "Authorization": `Bearer ${validToken}` } })).json();
  if (status.state === "SAFE/DISABLED") {
    console.log("  PASS: Workload stopped/blocked by remote auth revocation");
  } else {
    throw new Error("Remote auth revocation failed to stop workload");
  }
  mockConfig.worker_enabled = true;
  await fetch(`${DAEMON_URL}/consent/disable`, { method: "POST", headers: { "Authorization": `Bearer ${validToken}` } });
  await fetch(`${DAEMON_URL}/consent/enable`, { method: "POST", headers: { "Authorization": `Bearer ${validToken}` } });
  console.log("\n[Phase 4] Testing OCR Task Execution");
  mockConfig.worker_enabled = true;
  mockConfig.active_workload = "ocr-compute";
  await sleep(1500);
  res = await fetch(`${DAEMON_URL}/workload/execute`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${validToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "solveCaptcha", base64Image: "fake" })
  });
  if (res.status === 200) {
    const data = await res.json();
    if (data.success && data.result === "123456") {
      console.log("  PASS: Task execution properly delegated to OCR workload");
    } else {
      throw new Error("Task executed but returned unexpected payload: " + JSON.stringify(data));
    }
  } else {
    throw new Error("Task execution failed: " + res.status);
  }
  console.log("\n[Phase 5] Testing Telemetry Proxy");
  res = await fetch(`${DAEMON_URL}/telemetry/event`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${validToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "AUTOMATION_EVENTS", details: "[]" })
  });
  if (res.status === 200) {
    console.log("  PASS: Telemetry proxy accepted event");
  } else {
    throw new Error("Telemetry proxy failed: " + res.status);
  }
  console.log("\n--- E2E VERIFICATION COMPLETE ---");
}
controlPlane.listen(CONTROL_PLANE_PORT, "127.0.0.1", () => {
  const worker = (0, import_child_process.spawn)("node", ["dist/worker.js"], {
    env: { ...process.env, CONTROL_PLANE_URL: "http://127.0.0.1:34568", POLL_INTERVAL_MS: "1000" }
  });
  worker.stdout.on("data", (data) => console.log(`[DAEMON] ${data}`));
  worker.stderr.on("data", (data) => console.error(`[DAEMON] ${data}`));
  setTimeout(() => {
    runTests().then(() => {
      worker.kill();
      controlPlane.close();
      process.exit(0);
    }).catch((e) => {
      console.error(e);
      worker.kill();
      controlPlane.close();
      process.exit(1);
    });
  }, 2e3);
});
