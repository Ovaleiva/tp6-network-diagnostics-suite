import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { DiagnosticsScreen } from '../src/features/protocols/DiagnosticsScreen';

jest.mock('../src/infrastructure/protocols/androidSnmp', () => ({
  androidSnmp: { readBasicStatus: jest.fn(), cancel: jest.fn() },
}));

const service = jest.requireMock(
  '../src/infrastructure/protocols/androidSnmp',
).androidSnmp;
let app: ReactTestRenderer.ReactTestRenderer;
let repository: { saveDiagnosticWithAction: jest.Mock };
jest.useFakeTimers();

beforeEach(async () => {
  jest.resetAllMocks();
  repository = {
    saveDiagnosticWithAction: jest.fn().mockResolvedValue(undefined),
  };
  await act(async () => {
    app = ReactTestRenderer.create(
      <DiagnosticsScreen
        navigation={{} as never}
        route={{ key: 'diagnostic', name: 'Diagnostics', params: undefined }}
        repository={repository as never}
      />,
    );
  });
});

const labResult = {
  sysName: 'TP6-LAB-PC',
  uptimeTicks: 12345,
  interfaceIndex: 1,
  inOctets: 100,
  outOctets: 200,
};
afterEach(async () => {
  await act(async () => app.unmount());
});

function button(label: string) {
  const matches = app.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0]!;
}

test('consulta el laboratorio y muestra nombre, uptime y octetos acumulados', async () => {
  service.readBasicStatus.mockResolvedValue({
    id: 'diagnostic',
    protocol: 'snmp',
    status: 'success',
    snmp: {
      sysName: 'TP6-LAB-PC',
      uptimeTicks: 12345,
      interfaceIndex: 1,
      inOctets: 100,
      outOctets: 200,
    },
  });
  await act(async () => {
    await button('Consultar SNMP').props.onPress();
  });
  expect(service.readBasicStatus).toHaveBeenCalledWith(
    expect.objectContaining({ ip: '10.0.2.2' }),
    expect.objectContaining({
      port: 1161,
      community: 'public',
      interfaceIndex: 1,
    }),
  );
  const rendered = JSON.stringify(app.toJSON());
  expect(rendered).toContain('TP6-LAB-PC');
  expect(rendered).toContain('100');
  expect(rendered).toContain('200');
  expect(rendered).toContain('acumulados');
});

test('muestra el timeout y permite volver a consultar', async () => {
  service.readBasicStatus.mockRejectedValue(
    new Error('Sin respuesta UDP dentro del plazo.'),
  );
  await act(async () => {
    await button('Consultar SNMP').props.onPress();
  });
  expect(JSON.stringify(app.toJSON())).toContain('Sin respuesta UDP');
  expect(button('Consultar SNMP').props.disabled).toBe(false);
  expect(repository.saveDiagnosticWithAction).not.toHaveBeenCalled();
});

test('guarda la consulta exitosa con su acción diagnostic.upsert y sin la comunidad', async () => {
  service.readBasicStatus.mockImplementation(
    async (device: { id: string; siteId: string }) => ({
      id: 'snmp-1',
      deviceId: device.id,
      siteId: device.siteId,
      protocol: 'snmp',
      startedAt: '2026-10-29T20:00:00.000Z',
      finishedAt: '2026-10-29T20:00:01.000Z',
      status: 'success',
      summary: 'ok',
      snmp: labResult,
    }),
  );
  await act(async () => {
    await button('Consultar SNMP').props.onPress();
  });
  expect(repository.saveDiagnosticWithAction).toHaveBeenCalledTimes(1);
  const [diagnostic, action] =
    repository.saveDiagnosticWithAction.mock.calls[0];
  expect(diagnostic).toMatchObject({
    id: 'snmp-1',
    siteId: 'sitio-local',
    snmp: labResult,
  });
  expect(action).toMatchObject({
    entityId: 'snmp-1',
    entityRevision: 1,
    kind: 'diagnostic.upsert',
    state: 'pending',
    attempts: 0,
  });
  expect(JSON.stringify(diagnostic)).not.toContain('public');
  expect(JSON.stringify(app.toJSON())).toContain('Guardado en el dispositivo');
});

test('si no se puede guardar, el resultado sigue visible y se informa', async () => {
  service.readBasicStatus.mockResolvedValue({ id: 'snmp-2', snmp: labResult });
  repository.saveDiagnosticWithAction.mockRejectedValue(
    new Error('disco lleno'),
  );
  await act(async () => {
    await button('Consultar SNMP').props.onPress();
  });
  const rendered = JSON.stringify(app.toJSON());
  expect(rendered).toContain('TP6-LAB-PC');
  expect(rendered).toContain(
    'No se pudo guardar el resultado en el dispositivo',
  );
});

test('impide consultas simultáneas y permite cancelar', async () => {
  let reject!: (error: Error) => void;
  service.readBasicStatus.mockImplementation(
    () =>
      new Promise((_, rejectPromise) => {
        reject = rejectPromise;
      }),
  );
  service.cancel.mockImplementation(() =>
    reject(new Error('Consulta cancelada.')),
  );
  await act(async () => {
    button('Consultar SNMP').props.onPress();
    button('Consultar SNMP').props.onPress();
  });
  expect(service.readBasicStatus).toHaveBeenCalledTimes(1);
  await act(async () => {
    button('Cancelar consulta').props.onPress();
  });
  expect(service.cancel).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(app.toJSON())).toContain('Consulta cancelada.');
});
