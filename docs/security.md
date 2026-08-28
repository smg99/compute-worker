# Security & Safety Model

## Explicit User Consent
Compute must NEVER start silently. The user has a local kill switch that overrides any remote policy.

## Least Privilege
- Client-side credentials only have permissions required for telemetry and config fetching.
- No database or service_role keys are ever shipped to the client.

## Fail-Safe Default
If the remote control plane is unreachable, the worker falls back to the last known safe configuration or remains stopped.

## Bounded Workloads
Workloads are strictly defined via the `WorkloadProvider` abstraction. Arbitrary shell execution is completely forbidden.
