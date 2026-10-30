import type {
  Device,
  Diagnostic,
  EntityId,
  Installation,
  InstallationReport,
  OutboxAction,
} from '../../core/domain/models';

export interface LocalRepository {
  saveDevices(devices: Device[]): Promise<void>;
  findDevice(id: EntityId): Promise<Device | null>;
  listDevices(siteId: EntityId): Promise<Device[]>;
  listSites(): Promise<EntityId[]>;
  findDiagnostic(id: EntityId): Promise<Diagnostic | null>;
  listDiagnostics(filter: {
    deviceId?: EntityId;
    siteId?: EntityId;
  }): Promise<Diagnostic[]>;
  findInstallation(id: EntityId): Promise<Installation | null>;
  listInstallations(siteId?: EntityId): Promise<Installation[]>;
  findReport(id: EntityId): Promise<InstallationReport | null>;
  // Reportes de todas las instalaciones o de una, del más reciente al más viejo.
  listReports(installationId?: EntityId): Promise<InstallationReport[]>;
  // Las dos escrituras deben confirmarse juntas en una transacción de la base local.
  saveInstallationWithAction(
    installation: Installation,
    action: OutboxAction,
  ): Promise<void>;
  saveDiagnosticWithAction(
    diagnostic: Diagnostic,
    action: OutboxAction,
  ): Promise<void>;
  saveReportWithAction(
    report: InstallationReport,
    action: OutboxAction,
  ): Promise<void>;
  listPendingActions(): Promise<OutboxAction[]>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

// Operaciones de la cola que usa solo la capa de sincronización.
export interface OutboxStore {
  // Acciones 'pending' cuyo próximo intento ya venció, en orden de creación.
  listReadyActions(now: Date, limit?: number): Promise<OutboxAction[]>;
  markSending(id: EntityId): Promise<void>;
  markSent(id: EntityId): Promise<void>;
  markFailed(id: EntityId, error: string, now: Date): Promise<void>;
  markConflict(id: EntityId, error: string): Promise<void>;
  // Error permanente (el backend rechazó los datos): queda 'failed' sin reintento automático.
  markRejected(id: EntityId, error: string): Promise<void>;
  // El técnico descarta la acción; la entidad local se conserva.
  discard(id: EntityId): Promise<void>;
  // Si la app se cerró en pleno envío, esas acciones vuelven a 'pending'.
  recoverInterrupted(): Promise<number>;
  retryFailed(): Promise<number>;
}
