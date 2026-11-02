import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { ModuleScreen } from '../src/shared/components/ModuleScreen';
import { DevicesScreen } from '../src/features/discovery/DevicesScreen';
import { DiagnosticsScreen } from '../src/features/protocols/DiagnosticsScreen';
import { InstallationScreen } from '../src/features/evidence/InstallationScreen';
import { ReportsScreen } from '../src/features/reporting/ReportsScreen';
import { SshScreen } from '../src/features/protocols/SshScreen';
import { HistoryScreen } from '../src/features/history/HistoryScreen';
import { SyncScreen } from '../src/features/sync/SyncScreen';

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
    listReports: jest.fn().mockResolvedValue([]),
    listPendingActions: jest.fn().mockResolvedValue([]),
    getSetting: jest.fn().mockResolvedValue(null),
  }),
}));

jest.mock('../src/infrastructure/sync/androidSync', () => ({
  startAutoSync: jest.fn(() => jest.fn()),
  getSyncController: jest.fn(() => ({
    getState: () => ({ running: false }),
    subscribe: () => () => {},
    syncNow: jest.fn(),
  })),
}));

jest.mock('../src/infrastructure/evidence/androidEvidence', () => ({
  androidEvidence: {},
}));

jest.mock('../src/infrastructure/reporting/androidReporting', () => ({
  androidReporting: {},
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

test('Reportes abre la lista de instalaciones y permite volver a Inicio', async () => {
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.navigate('Reports');
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(ReportsScreen)).toHaveLength(1);
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
  expect(JSON.stringify(app.toJSON())).toContain('RF-06 · PDF DE INSTALACIÓN');
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.goBack();
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(ReportsScreen)).toHaveLength(0);
});

test('Historial abre la consulta local y permite volver a Inicio', async () => {
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.navigate('History');
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(HistoryScreen)).toHaveLength(1);
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
  expect(JSON.stringify(app.toJSON())).toContain('RF-08 · HISTORIAL SIN CONEXIÓN');
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.goBack();
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(HistoryScreen)).toHaveLength(0);
});

test('Sincronización abre la cola y permite volver a Inicio', async () => {
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.navigate('Sync');
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(SyncScreen)).toHaveLength(1);
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
  expect(JSON.stringify(app.toJSON())).toContain('RF-07 · SINCRONIZACIÓN');
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.goBack();
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(SyncScreen)).toHaveLength(0);
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

test('Diagnóstico abre SSH con el mismo equipo', async () => {
  await act(async () => {
    app.root
      .findByType(HomeScreen)
      .props.navigation.navigate('Diagnostics', { deviceId: 'equipo-prueba', ip: '192.0.2.10' });
    jest.runAllTimers();
  });
  const open = app.root.find(
    node =>
      node.props.accessibilityLabel === 'Abrir diagnóstico SSH' &&
      typeof node.props.onPress === 'function',
  );
  await act(async () => {
    open.props.onPress();
    jest.runAllTimers();
  });
  const screen = app.root.findByType(SshScreen);
  expect(screen.props.route.params).toMatchObject({ deviceId: 'equipo-prueba', ip: '192.0.2.10' });
  expect(JSON.stringify(app.toJSON())).toContain('RF-03 · SSH CON COMANDOS PREDEFINIDOS');
});
