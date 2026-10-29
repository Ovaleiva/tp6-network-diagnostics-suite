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
jest.useFakeTimers();

beforeEach(async () => {
  jest.resetAllMocks();
  await act(async () => {
    app = ReactTestRenderer.create(
      <DiagnosticsScreen
        navigation={{} as never}
        route={{ key: 'diagnostic', name: 'Diagnostics', params: undefined }}
      />,
    );
  });
});
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
