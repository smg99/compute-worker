# Production Readiness Audit - Compute Worker

## 1. Mocked Control-Plane Paths & Hardcoded Configuration
- **`ConfigPoller` (`src/core/config.ts`)**: Currently checks if the URL contains `'mock'` and bypasses actual network requests, instead reading from `.worker-data/mock-config.json`. The actual `fetch` call is commented out.
- **`WorkerRuntime` Initialization (`src/index.ts`)**: Hardcodes the control plane URL to `https://api.mock-control-plane.com`.
- **`Heartbeat` (`src/core/heartbeat.ts`)**: Currently lacks the actual `fetch` logic to upload queued events to the backend, likely just dumping to console or memory.

## 2. Insecure Development Fallbacks & Authentication
- **Remote Configuration Trust**: The worker blindly accepts whatever JSON is returned by the control plane (or the mock file). There is **no cryptographic signature verification** (e.g., JWT or Ed25519) to prove the configuration payload actually came from our authoritative backend and wasn't tampered with via DNS spoofing or MITM.
- **Worker Identity vs. IPC Token**: 
  - The worker uses a random UUID for `installation_id` (Worker Identity) and another random UUID for `auth.key` (IPC Auth Token).
  - Both are generated on first boot and persisted locally, but there is no mechanism for the worker to securely authenticate *itself* to the control plane. It currently just passes its `installation_id` in the clear.

## 3. State Persistence Problems
- **`WorkerState` Resume Bug**: The `is_compute_requested` flag is persisted to `worker-state.json`. If the worker crashes while a workload is requested and then restarts, it will automatically resume the workload if `user_consent` is true. The standalone smoke test previously bypassed this by completely deleting the `.worker-data` folder before starting. For production, `is_compute_requested` should default to `false` in-memory on every cold boot, regardless of prior persistence, ensuring the client must explicitly request compute again.

## 4. Popup Lifetime Incorrectly Controls Worker Safety
- **RTO Extension Integration (`popup.js`)**: The RTO extension currently implements its safety net (kill-switch detection) via a `setInterval` that polls `GET /status` every 3 seconds. However, this polling logic lives entirely inside `popup.js`. 
- **The Danger**: If the user starts the RTO batch and then closes the popup, the batch continues executing via `background.js`, but the polling stops. If a remote kill-switch is activated during this time, the extension will **not** detect it, and the automation will continue running indefinitely. This logic must be moved to `background.js`.

## 5. Faux "Production-Ready" Components
- **`resource-manager.ts`**: Claims to manage CPU/Memory but currently just logs `UNSUPPORTED` for macOS/Windows. It does not enforce `max_cpu_percent` or `max_memory_mb`.
- **Telemetry Infrastructure**: Supabase schemas exist (`supabase.sql`), but the Edge Functions/REST API endpoints to ingest this telemetry and serve configurations do not exist yet.

## 6. Duplicated Logic
- The RTO extension has duplicate telemetry queues and API logic for Supabase (in `background.js` for automation events) that is completely separate from the Compute Worker's telemetry logic.

---

**Conclusion**: The worker is secure from local unprivileged access (thanks to dynamic IPC tokens) and fail-closed logic, but it is wholly unequipped to securely communicate with a real control plane over the internet, and its integration with RTO is currently fragile to UI lifecycles.
