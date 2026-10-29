import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type {
  Installation,
  InstallationReport,
} from '../src/core/domain/models';
import { ReportsScreen } from '../src/features/reporting/ReportsScreen';

const installation: Installation = {
  id: 'inst-1',
  siteId: 'torre-norte',
  notes: 'ONT instalada',
  photos: [],
  createdAt: '2026-10-29T12:00:00.000Z',
  revision: 2,
};

function report(overrides: Partial<InstallationReport> = {}): InstallationReport {
  return {
    id: 'rep-inst-1-r2',
    installationId: 'inst-1',
    installationRevision: 2,
    localPdfUri: 'file:///files/reports/rep-inst-1-r2.pdf',
    createdAt: '2026-10-29T12:10:00.000Z',
    ...overrides,
  };
}

let app: ReactTestRenderer.ReactTestRenderer;
let saved: InstallationReport[];
let repository: {
  listInstallations: jest.Mock;
  listReports: jest.Mock;
  saveReportWithAction: jest.Mock;
};
let reporting: { generate: jest.Mock; open: jest.Mock };

async function render(reports: InstallationReport[] = []) {
  saved = [...reports];
  repository = {
    listInstallations: jest.fn().mockResolvedValue([installation]),
    listReports: jest.fn(async () => [...saved]),
    saveReportWithAction: jest.fn(async (item: InstallationReport) => {
      saved.unshift(item);
    }),
  };
  reporting = {
    generate: jest.fn().mockResolvedValue(report()),
    open: jest.fn().mockResolvedValue(undefined),
  };
  await act(async () => {
    app = ReactTestRenderer.create(
      <ReportsScreen services={{ repository, reporting } as never} />,
    );
  });
}

afterEach(async () => {
  await act(async () => app.unmount());
});

function button(label: string) {
  return app.root.find(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
}

function text() {
  return JSON.stringify(app.toJSON());
}

test('lista las instalaciones guardadas sin PDF', async () => {
  await render();
  expect(text()).toContain('torre-norte rev. 2');
  expect(text()).toContain('Sin PDF generado.');
  expect(app.root.findAll(node => node.props.accessibilityLabel === 'Abrir PDF torre-norte rev. 2')).toHaveLength(0);
});

test('genera el PDF y lo guarda con su acción report.upload', async () => {
  await render();
  await act(async () => {
    await button('Generar PDF torre-norte rev. 2').props.onPress();
  });
  expect(reporting.generate).toHaveBeenCalledWith(installation);
  expect(repository.saveReportWithAction).toHaveBeenCalledWith(
    report(),
    expect.objectContaining({
      kind: 'report.upload',
      entityId: 'rep-inst-1-r2',
      entityRevision: 2,
      state: 'pending',
    }),
  );
  expect(text()).toContain('PDF guardado en el dispositivo');
  expect(text()).toContain('PDF generado el');
});

test('abre el último PDF de la instalación', async () => {
  await render([report()]);
  await act(async () => {
    await button('Abrir PDF torre-norte rev. 2').props.onPress();
  });
  expect(reporting.open).toHaveBeenCalledWith(report());
});

test('avisa si el PDF es de una revisión anterior', async () => {
  await render([report({ id: 'rep-inst-1-r1', installationRevision: 1 })]);
  expect(text()).toContain('El PDF es de la revisión 1; genere uno nuevo.');
});

test('muestra el error si no se puede generar y no guarda nada', async () => {
  await render();
  reporting.generate.mockRejectedValue(new Error('sin espacio'));
  await act(async () => {
    await button('Generar PDF torre-norte rev. 2').props.onPress();
  });
  expect(repository.saveReportWithAction).not.toHaveBeenCalled();
  expect(text()).toContain('No se pudo generar el PDF: sin espacio');
});

test('muestra el error del visor', async () => {
  await render([report()]);
  reporting.open.mockRejectedValue(new Error('No hay una app instalada para abrir PDF.'));
  await act(async () => {
    await button('Abrir PDF torre-norte rev. 2').props.onPress();
  });
  expect(text()).toContain('No hay una app instalada para abrir PDF.');
});
