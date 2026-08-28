export interface WorkloadMetrics {
  cpu_percent?: number;
  threads?: number;
  uptime_seconds: number;
  status: 'stopped' | 'starting' | 'running' | 'error';
  [key: string]: any;
}

export interface WorkloadConfiguration {
  id: string;
  version: string;
  max_cpu_percent?: number;
  [key: string]: any;
}

export interface WorkloadProvider {
  /** Unique identifier for this provider */
  readonly id: string;
  /** Human readable name */
  readonly name: string;
  /** Provider version */
  readonly version: string;
  /** Description of the workload */
  readonly description: string;
  /** Capabilities this provider supports */
  readonly capabilities: string[];
  /** Expected resource requirements */
  readonly resource_requirements: any;
  /** Platforms supported by this workload */
  readonly supported_platforms: string[];

  /** Initializes the workload provider before start */
  initialize(): Promise<void>;
  
  /** Starts the workload with the given configuration */
  start(config: WorkloadConfiguration): Promise<void>;
  
  /** Pauses the workload temporarily */
  pause(): Promise<void>;
  
  /** Resumes a paused workload */
  resume(): Promise<void>;
  
  /** Stops the workload gracefully */
  stop(): Promise<void>;
  
  /** Tears down and cleans up any global state */
  shutdown(): Promise<void>;
  
  /** Execute a specific task on this workload, if supported */
  executeTask?(payload: any): Promise<any>;
  
  /** Returns the current metrics and status of the workload */
  metrics(): Promise<WorkloadMetrics>;
}
