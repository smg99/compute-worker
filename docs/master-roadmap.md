# Compute Worker Master Delivery Plan

This document is the execution plan for taking Compute Worker from the verified Phase 0/1 foundation to a production-ready reusable execution layer.

## Definition of done

The core MVP is complete when all of these are true:

- macOS and Linux installers obtain a release artifact without a source checkout.
- The worker runs without Node.js being preinstalled by the end user.
- Local consent and local stop always override remote policy.
- Workloads run only through registered, structured providers; no remote shell execution exists.
- Workloads are isolated, resource-limited where the OS permits it, supervised, and crash-recovered with bounded retries.
- Worker registration, policy retrieval, heartbeat, telemetry, revocation, and kill-switch use an authenticated production control plane.
- Remote configuration is authenticated and integrity-protected, expires safely, and is never accepted from untrusted disk state.
- Dashboard exposes worker fleet health, policy state, versions, workload state, and recent telemetry.
- Product adapters expose a stable localhost client contract and can detect worker availability/capability.
- CI builds, tests, packages, and publishes release artifacts; installers consume those artifacts.
- Security, offline behavior, upgrade/rollback, and failure paths are covered by automated tests.

## Execution phases

### Phase 2 — Production control plane
Worker registration, authenticated policy/config API, telemetry ingestion, policy versioning, revocation, config expiry, and integration tests.

### Phase 3 — Fleet dashboard
Private operator dashboard for workers, policies, capabilities, workload state, versions, heartbeats, errors, and safe policy changes.

### Phase 4 — Distribution and updates
Signed release artifacts, standalone executables, macOS LaunchAgent lifecycle, Linux user service, update/rollback, installer smoke tests, and GitHub Actions release automation.

### Phase 5 — Product integration
Stable browser/local SDK, RTO adapter contract, Founder Worker adapter contract, capability negotiation, availability checks, and integration test fixtures.

### Phase 6 — Workload platform hardening
Provider manifest/schema, capability/resource declarations, workload allowlists, configuration validation, process sandbox boundaries, health checks, and compatibility/version policy.

### Phase 7 — Operational readiness
Observability, bounded telemetry, privacy audit, incident/revocation procedures, backups, migrations, disaster recovery, performance/load tests, and production runbook.

### Phase 8 — Optional workload expansion
Only after the core platform is stable: additional legitimate workloads such as AI/local inference or a separately packaged compute provider. Product-specific workloads remain adapters and never become part of the core authorization model.

## Explicit non-goals

- No arbitrary remote shell execution.
- No stealth or concealment mechanisms.
- No collection of personal files, browser contents, passwords, cookies, or private keys.
- No fictitious SOL mining implementation; PoW mining and any external conversion are separate concerns.
- No giant distributed-computing marketplace until real usage requires it.

## Acceptance gate

A phase is considered complete only after implementation, automated verification, clean working tree, commit, push, and a release artifact where applicable. The final MVP gate requires a fresh-machine install and a complete consent → authorized workload → stop/revoke → recovery lifecycle.
