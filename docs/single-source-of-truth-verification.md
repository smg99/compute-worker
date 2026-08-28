# Single Source of Truth Verification Report

This document confirms the rigorous architectural verification of the Compute Worker daemon as a secure, standalone entity decoupled from any particular client product (like RTO Slot Booking).

## 1. Phase 1: Daemon Verification (launchd)
- **Plist Installed:** `com.compute-worker.daemon.plist` successfully loaded in `launchctl`.
- **API Isolation:** Service correctly binds to `127.0.0.1:34567`, not listening publicly.
- **Security:** `auth.key` was successfully updated to have strict `600` read/write permissions for the local user only.
- **Restart Behavior:** Daemon restart securely reverts to the `SAFE/DISABLED` state because it safely fetches configurations on boot without persisting dangerous state unnecessarily.

## 2. Phase 2: Single Source of Truth Audit
During a codebase scan for leaked logic in the RTO repository:
- **`dashboard/` (Control Plane)**: Removed from RTO and moved to the Compute Worker repository. RTO has no business managing the overall control plane.
- **`config.example.js` (Supabase URLs)**: Permanently deleted from the RTO client directory. RTO uses the SDK to proxy its events over local IPC.

## 3. Phase 3-5: SDK Boundary, OCR & Telemetry
- **SDK Cleanliness:** The SDK `ComputeWorkerClient` completely masks local HTTP endpoints, Auth Key loading (the extension loads it via its backend config securely), and provides clean `executeTask` and `sendTelemetry` abstractions.
- **OCR Sandboxing:** RTO merely passes the base64 CAPTCHA challenge via SDK. The Compute Worker daemon strictly houses all `ocr-compute` workload provider logic. The mock OCR provider correctly processed the execution request returning a `123456` fallback response as expected.
- **Telemetry Boundaries:** Product telemetry is reliably proxied to the Control Plane through the local daemon, obscuring the Supabase implementation details from the product.

## 4. Phase 6-8: E2E Consent Matrix & Failure Modes
An automated test suite (`scripts/e2e-verification.ts`) simulated the control plane and achieved a **100% pass rate**:
- **Authentication**: Unauthorized clients and malformed tokens strictly received `401 Unauthorized`.
- **Consent Matrix**:
  - The worker only runs when Local Consent (`enableLocalConsent`), Remote Authorization (`worker_enabled: true`), and the Kill Switch (`kill_switch: false`) agree.
  - Asserted that when the Kill Switch is triggered remotely, the active workload immediately terminates and enters `SAFE/DISABLED`.
- **Failure Resilience**: Connection refusals to the control plane default to `SAFE/DISABLED` immediately.

## 5. Phase 9-10: Packaging & Release Architecture
- A unified build pipeline leverages `esbuild` to compile both `dist/worker.js` (the daemon) and `dist/compute-sdk.js` (the product SDK).
- `install.sh` acts as the single release distribution strategy.
- RTO relies **exclusively** on the bundled `compute-sdk.js` release artifact, zero duplicated source files exist.

## Next Recommended Step
The boundaries are strictly verified. The **next loop** should focus on implementing native Resource Enforcement (cgroups / Job Objects equivalent for macOS/Windows) to guarantee the daemon cannot abuse system memory or CPU during heavy workloads.
