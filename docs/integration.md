# Product Integration Guide

## Overview
Products integrate with the Compute Worker using thin adapters. They do not ship their own compute engines.

## Steps for Integration
1. **Instantiate Adapter**: Provide the product's unique identity.
   ```typescript
   const worker = new ComputeWorkerClient({ productId: 'rto-slot-booking' });
   ```
2. **Check Status**: Ensure compute is available and authorized before running product logic that depends on it.
   ```typescript
   const status = await worker.status();
   if (!status.compute_enabled) {
     // Compute is not available, handle gracefully
   }
   ```
3. **Handle Disconnects**: React appropriately if the worker daemon goes offline or the user disables compute via the local kill switch.
