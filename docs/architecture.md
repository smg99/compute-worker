# Compute Worker Architecture

## Overview
The Compute Worker is a standalone infrastructure component that manages local execution for authorized workloads. It is decoupled from any specific product, acting as a shared local resource.

## Components

### Core Runtime
The foundational state machine managing the compute worker's lifecycle, consent, and background services.

### Control Plane Client & Database
Communicates securely with the remote dashboard/API to fetch signed policies and report telemetry. The remote state is backed by a robust **Supabase SQL database** that handles worker registration, heartbeat tracking, and global kill switch propagation without trusting the client.

### Workload Providers
Adapters implementing the extended generic `WorkloadProvider` interface (supporting `initialize`, `start`, `pause`, `resume`, `stop`, `shutdown`) to execute specific tasks (e.g., Test Compute, AI Inference, etc.).

### Client Adapters
Thin communication layers for products (like browser extensions) to securely query the worker's status over a hardened local HTTP API bound explicitly to loopback IPs with Bearer token authentication.
