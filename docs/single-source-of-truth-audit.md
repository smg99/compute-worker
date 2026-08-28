# Single Source of Truth Audit

This audit evaluates the current integration against the core architectural rule: **The Compute Worker is a separate, installable product and the single source of truth for all local compute.**

## 1. Workload Implementation Exists in RTO
- **Issue**: `RTO Slot Booking/compute.js` implements the `solveCaptcha` method, which makes network calls to a public OCR API (`api.ocr.space`).
- **Classification**: **Should be removed from RTO / Compute Worker-owned**
- **Reasoning**: OCR is a heavy compute workload. The RTO extension should not execute compute workloads itself; it should delegate the CAPTCHA solving task to the Compute Worker via the local IPC API.

## 2. Supabase / Control-Plane Logic Exists in RTO
- **Issue**: `RTO Slot Booking/background.js` contains a `flushQueue()` function that directly pushes `automation_events` to a remote Supabase REST API (`/rest/v1/automation_events`) using `CONFIG.SUPABASE_URL` and `CONFIG.SUPABASE_ANON_KEY`.
- **Classification**: **Should be removed from RTO / Compute Worker-owned**
- **Reasoning**: The architecture diagram dictates that the Compute Worker is the sole component that communicates with the Supabase Control Plane. The RTO extension should funnel any required telemetry/events through the local Compute Worker API.

## 3. Worker Code Copied into the Extension (Missing SDK Usage)
- **Issue**: `RTO Slot Booking/compute.js` manually implements `window.ComputeProvider`, rewriting the `fetch` logic to hit `http://127.0.0.1:34567`.
- **Classification**: **Client/adapter-owned (but currently duplicated)**
- **Reasoning**: The RTO extension should import or bundle the official `ComputeWorkerClient` and `RtoComputeAdapter` from the Compute Worker repository instead of maintaining a fork of the API wrapper.

## 4. RTO Assumes Internal Worker Implementation Details
- **Issue**: `RTO Slot Booking/background.js` and `popup.js` both manually inspect the JSON payload from the worker (e.g., checking `if (statusData.workload_state !== 'running')` and `if (status === 'AUTH_FAILED')`) to determine if the kill switch was activated or if compute is granted.
- **Classification**: **Client/adapter-owned**
- **Reasoning**: Policy logic (whether a workload is authorized to run or if a kill switch fired) belongs to the Compute Worker. The adapter should expose a clean abstraction (e.g., event listeners for `onKillSwitch` or a simple `isAuthorized()` boolean), rather than the extension parsing the internal state machine string.

## 5. Summary
The current integration treats the Compute Worker as a "permission gate" rather than the **execution runtime**. RTO asks for permission, but then executes the OCR workload itself and sends its own telemetry to Supabase. This violates the boundary.
