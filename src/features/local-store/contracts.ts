import type {
  Device,
  Diagnostic,
  EntityId,
  Installation,
  InstallationReport,
  OutboxAction,
} from '../../core/domain/models';

export interface LocalRepository {
  findDevice(id: EntityId): Promise<Device | null>;
  listDevices(siteId: EntityId): Promise<Device[]>;
  listDiagnostics(filter: {
    deviceId?: EntityId;
    siteId?: EntityId;
  }): Promise<Diagnostic[]>;
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
}
