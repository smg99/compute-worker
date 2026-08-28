# Control Plane Protocol

## Remote Configuration Polling
Workers periodically poll the remote control plane for authorized configurations.

### Request
```json
{
  "installation_id": "uuid",
  "product_id": "rto-slot-booking",
  "worker_version": "1.0.0"
}
```

### Response
```json
{
  "compute_enabled": true,
  "workload_id": "test-compute",
  "worker_version": "1.0.0",
  "max_cpu_percent": 50,
  "heartbeat_interval": 30000,
  "config_version": 1
}
```

## Local API Interface
Client adapters communicate with the worker via local API to fetch status.

### Endpoints
- `GET /status`: Returns current worker status, enabled state, and workload.
- `POST /enable`: Enables local compute locally (subject to remote policy).
- `POST /disable`: Disables compute locally (kill switch).
