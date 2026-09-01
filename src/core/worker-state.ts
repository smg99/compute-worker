import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface PersistedState {
  installation_id: string;
  user_consent: boolean;
  is_compute_requested: boolean;
  last_known_config?: any;
  control_plane_token?: string;
}

export class WorkerState {
  private stateFilePath: string;
  private state: PersistedState;

  constructor(stateDir: string) {
    this.stateFilePath = path.join(stateDir, 'worker-state.json');
    this.state = this.loadState();
    this.restrictStateFilePermissions();
  }

  private loadState(): PersistedState {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const data = fs.readFileSync(this.stateFilePath, 'utf8');
        const parsed = JSON.parse(data);
        // FORCE is_compute_requested to false on cold boot
        parsed.is_compute_requested = false;
        // Never trust disk-stored remote config — it must be re-fetched and JWT-verified
        parsed.last_known_config = undefined;
        return parsed;
      } catch (e) {
        console.error('Failed to parse worker state', e);
      }
    }
    
    // Default state if file doesn't exist or is corrupt
    return {
      installation_id: randomUUID(),
      user_consent: false, // Always default to false for safety
      is_compute_requested: false
    };
  }

  private saveState() {
    try {
      fs.mkdirSync(path.dirname(this.stateFilePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
      this.restrictStateFilePermissions();
    } catch (e) {
      console.error('Failed to save worker state', e);
    }
  }

  private restrictStateFilePermissions() {
    try {
      // State contains the control-plane token, so it must not be group/world-readable.
      fs.chmodSync(this.stateFilePath, 0o600);
      fs.chmodSync(path.dirname(this.stateFilePath), 0o700);
    } catch {
      // Windows does not provide POSIX file modes; ACL-based protection is platform-specific.
    }
  }

  public get installationId(): string {
    return this.state.installation_id;
  }

  public get hasUserConsent(): boolean {
    return this.state.user_consent;
  }

  public setConsent(consent: boolean) {
    this.state.user_consent = consent;
    this.saveState();
  }

  public get isComputeRequested(): boolean {
    return this.state.is_compute_requested;
  }

  public setComputeRequested(requested: boolean) {
    this.state.is_compute_requested = requested;
    this.saveState();
  }

  public get controlPlaneToken(): string | null {
    return this.state.control_plane_token || null;
  }

  public setControlPlaneToken(token: string) {
    this.state.control_plane_token = token;
    this.saveState();
  }

  public get lastKnownConfig(): any {
    return this.state.last_known_config;
  }

  public setLastKnownConfig(config: any) {
    this.state.last_known_config = config;
    this.saveState();
  }
}
