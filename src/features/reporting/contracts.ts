import type {
  Installation,
  InstallationReport,
} from '../../core/domain/models';

export interface ReportingService {
  generate(installation: Installation): Promise<InstallationReport>;
}
