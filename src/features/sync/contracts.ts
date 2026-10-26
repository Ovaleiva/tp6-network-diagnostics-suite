// Acceder a un router no implica acceder al backend.
export interface ConnectivityStatus {
  lanConnected: boolean;
  internetReachable: boolean | null;
  backendReachable: boolean | null;
}

export interface SyncSummary {
  sent: number;
  pending: number;
  conflicts: number;
}

export interface SyncService {
  syncPending(signal?: AbortSignal): Promise<SyncSummary>;
}
