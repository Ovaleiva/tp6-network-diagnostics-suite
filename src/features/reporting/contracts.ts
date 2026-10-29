import type {
  Installation,
  InstallationReport,
} from '../../core/domain/models';

export interface ReportingService {
  // Genera el PDF en el dispositivo; no lo guarda en la base ni lo encola.
  generate(installation: Installation): Promise<InstallationReport>;
  // Abre el PDF local con un visor del sistema.
  open(report: InstallationReport): Promise<void>;
}
