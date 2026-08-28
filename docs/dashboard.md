# Compute Worker Dashboard

## Overview
The developer dashboard is intended to manage the fleet of Compute Workers securely. Following the architecture established in RTO, the dashboard interacts exclusively with a privileged backend (Supabase) via service-role keys on the server-side, never exposing these credentials to the browser or the workers themselves.

## Key Capabilities

### Fleet Visibility
- **Total Workers:** Number of distinct `installation_id`s registered.
- **Online Workers:** Count of workers sending heartbeats within the last 5 minutes.
- **Worker Version Distribution:** Aggregated counts of `worker_version` to track rollout adoption.

### Control Mechanisms
- **Global Toggle:** Enable or disable compute across the entire fleet instantly.
- **Kill Switch:** A boolean flag that forces all participating workers to immediately stop their workloads and enter a disabled state upon their next config poll.
- **Workload Management:** Set the `active_workload` (currently only `test-compute`) and define `allowed_workloads`.
- **Resource Limits:** Define safe baseline limits like `max_cpu_percent` and `max_memory_mb`.

### Telemetry Insights
- **Active Workloads:** Monitor which workloads are currently running and their metrics (e.g. mock CPU usage).
- **Error Tracking:** View telemetry events flagged with type `ERROR` or `WORKLOAD_CRASHED` to identify problematic provider updates.

## Architecture
- **Supabase Backend:** Houses the relational state (Workers, Configurations, Heartbeats).
- **Vercel Frontend:** A private admin panel using Next.js Server Components.
- **Security:** Requires robust Admin authentication. Changes to the database trigger workers to adopt the new state during their next polling interval.
