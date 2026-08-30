# Compute Worker

Reusable local execution infrastructure for products that need authorized local compute.

## Current release

`v0.2.4` is the current Phase 2 release: authenticated worker enrollment, remote policy retrieval, signed/expiring policy tokens, authenticated telemetry, standalone executables, supervised workload processes, resource enforcement, and a private fleet dashboard.

## Safety model

Compute is permitted only when **all** required gates are true:

1. The machine owner has explicitly enabled local consent.
2. A product has explicitly requested compute.
3. The worker has a valid remote policy.
4. The policy has not expired and the worker is not revoked.
5. The kill switch is off.
6. The workload is registered and allowlisted.
7. The worker version satisfies policy requirements.

The remote control plane cannot override the local consent/stop mechanism. Remote policies are structured data; there is no arbitrary remote shell execution.

## Development

```bash
npm ci
npm test
npm run build
npx tsx scripts/e2e-verification.ts
npm run build:standalone
```

The standalone build produces a platform-specific executable using Node.js Single Executable Applications. macOS artifacts are ad-hoc signed for local execution; production distribution can add Developer ID signing and notarization in CI.

## Release

Pushing a `v*` tag runs `.github/workflows/release.yml` and publishes standalone artifacts for macOS arm64/x64, Linux x64/arm64, and Windows x64.

## Installation

The installers download a release executable; the source repository and Node.js are not required on the target machine.

Set the deployed control-plane URL and run:

```bash
export COMPUTE_WORKER_CONTROL_PLANE_URL="https://<your-control-plane>"
curl -fsSL https://raw.githubusercontent.com/smg99/compute-worker/main/scripts/install.sh | bash
```

macOS-specific and Windows installers are also provided in `scripts/`.

## Repository layout

- `src/core/` — state, security, configuration, telemetry, resources, process supervision
- `src/providers/` — workload adapters
- `src/clients/` — product-facing clients
- `control-plane/` — Supabase schema and Edge Functions
- `dashboard/` — private operator dashboard
- `scripts/` — build, E2E, release and installers
- `docs/master-roadmap.md` — full delivery roadmap

## Control plane

The production control plane requires a Supabase project with the schema in `control-plane/supabase.sql`, the three Edge Functions under `control-plane/supabase/functions/`, and a per-project worker token is stored locally after enrollment. The control plane signs each policy with that worker token; no global signing secret is shipped to workers.

Until a dedicated production Supabase project is selected and deployed, the repository remains intentionally safe-by-default and can continue to operate against the mock E2E control plane.
