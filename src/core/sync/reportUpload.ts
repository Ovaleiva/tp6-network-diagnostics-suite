import type { InstallationReport } from '../domain/models';

// Revisión con la que se sincroniza el reporte. Los reportes anteriores al
// campo generation se enviaron con la revisión de la instalación.
export function reportGeneration(report: InstallationReport): number {
  return report.generation ?? report.installationRevision;
}

// Cada generación es otro archivo: el backend rechaza contenido nuevo con un
// fileId ya usado. Los reportes anteriores conservan el fileId que tenían.
export function reportFileId(report: InstallationReport): string {
  return report.generation === undefined ? report.id : `${report.id}-g${report.generation}`;
}

// Regenerar el PDF de la misma revisión sube la generación; una revisión nueva
// de la instalación es otro reporte y empieza en 1.
export function nextReportGeneration(
  previous: InstallationReport | undefined,
  installationRevision: number,
): number {
  return previous?.installationRevision === installationRevision
    ? reportGeneration(previous) + 1
    : 1;
}
