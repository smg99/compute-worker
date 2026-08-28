/**
 * Security & Kill Switch logic
 */

import { WorkerState } from './worker-state';
import { RemoteConfigurationResponse } from '../control-plane/api-contracts';

export class Security {
  constructor(private state: WorkerState) {}

  /**
   * Determines if compute is actually allowed to run at this exact moment.
   * This is the single source of truth for authorization.
   */
  public isComputeAuthorized(remoteConfig: RemoteConfigurationResponse | null, workerVersion: string): boolean {
    // 1. User must explicitly consent locally
    if (!this.state.hasUserConsent) {
      return false;
    }

    // 1.5. A product must have actually requested compute
    if (!this.state.isComputeRequested) {
      return false;
    }

    // 2. We must have a valid remote policy
    if (!remoteConfig) {
      return false;
    }

    // 3. Kill switch overrides everything
    if (remoteConfig.kill_switch) {
      return false;
    }

    // 4. Remote policy must enable compute
    if (!remoteConfig.worker_enabled) {
      return false;
    }

    // 5. Worker version check
    if (remoteConfig.minimum_worker_version) {
      // In a real app, use semver to check
      if (workerVersion < remoteConfig.minimum_worker_version) {
        return false;
      }
    }

    // 6. Remote policy must specify a valid workload that is in the allowed list
    if (!remoteConfig.active_workload || !remoteConfig.allowed_workloads.includes(remoteConfig.active_workload)) {
      return false;
    }

    return true;
  }
}
