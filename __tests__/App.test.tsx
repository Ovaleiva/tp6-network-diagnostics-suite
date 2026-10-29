import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { ModuleScreen } from '../src/shared/components/ModuleScreen';
import { DevicesScreen } from '../src/features/discovery/DevicesScreen';
import { DiagnosticsScreen } from '../src/features/protocols/DiagnosticsScreen';
import { InstallationScreen } from '../src/features/evidence/InstallationScreen';

jest.mock('../src/specs/NativeNetworkDiscovery', () => ({
  __esModule: true,
  default: {
    getNetworkInfo: jest.fn().mockResolvedValue({
      address: '10.0.2.16',
      transport: 'Wi-Fi',
      emulator: true,
    }),
    cancelDiscovery: jest.fn(),
  },
}));

jest.mock('../src/infrastructure/storage/opSqlite', () => ({
  getRepository: jest.fn().mockResolvedValue({
    listInstallations: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('../src/infrastructure/evidence/androidEvidence', () => ({
  androidEvidence: {},
}));

jest.useFakeTimers();

let app: ReactTestRenderer.ReactTestRenderer;
beforeEach(async () => {
  await act(async () => {
    app = ReactTestRenderer.create(<App />);
  });
});
afterEach(async () => {
  await act(async () => {
    app.unmount();
    jest.runOnlyPendingTimers();
  });
});

test('inicia en Inicio sin montar servicios ni pantallas de diagnóstico', () => {
  expect(app.root.findAllByType(HomeScreen)).toHaveLength(1);
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
});

test.each([
  ['Identificar equipo', 'Identificar equipo', 'RF-04'],
  ['Reportes', 'Reportes', 'RF-06'],
  ['Sincronización', 'Sincronización', 'RF-07'],
  ['Historial', 'Historial', 'RF-08'],
])('abre %s y permite volver a Inicio', async (label, title, requirement) => {
  const button = app.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
    jest.runAllTimers();
  });
  const module = app.root.findByType(ModuleScreen);
  expect(module.props.title).toBe(title);
  expect(module.props.requirement).toBe(requirement);
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.goBack();
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
});

test('Equipos abre la búsqueda funcional y permite volver a Inicio', async () => {
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.navigate('Devices');
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(DevicesScreen)).toHaveLength(1);
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.goBack();
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(DevicesScreen)).toHaveLength(0);
});

test('Instalación abre el formulario de evidencia y permite volver a Inicio', async () => {
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.navigate('Installation');
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(InstallationScreen)).toHaveLength(1);
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.goBack();
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(InstallationScreen)).toHaveLength(0);
});

test('Diagnóstico recibe el identificador del equipo por la ruta', async () => {
  await act(async () => {
    app.root
      .findByType(HomeScreen)
      .props.navigation.navigate('Diagnostics', { deviceId: 'equipo-prueba' });
    jest.runAllTimers();
  });
  expect(
    app.root.findByType(DiagnosticsScreen).props.route.params.deviceId,
  ).toBe('equipo-prueba');
  expect(JSON.stringify(app.toJSON())).toContain('Consultar SNMP');
});
