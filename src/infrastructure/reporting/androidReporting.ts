import {
  DocumentDirectoryPath,
  exists,
  mkdir,
  readFile,
  writeFile,
} from '@dr.pogodin/react-native-fs';
import NativePdfViewer from '../../specs/NativePdfViewer';
import type { ReportingService } from '../../features/reporting/contracts';
import {
  buildInstallationPdf,
  reportId,
} from '../../features/reporting/installationPdf';

// El módulo nativo solo comparte archivos de esta carpeta (res/xml/report_paths.xml).
const REPORT_DIR = `${DocumentDirectoryPath}/reports`;

function toPath(uri: string) {
  return uri.replace(/^file:\/\//u, '');
}

export const androidReporting: ReportingService = {
  async generate(installation) {
    const now = new Date();
    const pdf = await buildInstallationPdf(
      installation,
      async photo => {
        const path = toPath(photo.localUri);
        return (await exists(path)) ? readFile(path, 'base64') : undefined;
      },
      now,
    );
    if (!(await exists(REPORT_DIR))) await mkdir(REPORT_DIR);
    const id = reportId(installation);
    const target = `${REPORT_DIR}/${id}.pdf`;
    await writeFile(target, pdf, 'base64');
    return {
      id,
      installationId: installation.id,
      installationRevision: installation.revision,
      localPdfUri: `file://${target}`,
      createdAt: now.toISOString(),
    };
  },

  async open(report) {
    if (!NativePdfViewer) {
      throw new Error('El visor de PDF no está disponible en esta compilación.');
    }
    await NativePdfViewer.open(toPath(report.localPdfUri));
  },
};
