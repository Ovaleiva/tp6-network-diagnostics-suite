import React from 'react';
import { Platform } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { DevicesScreen } from '../src/features/discovery/DevicesScreen';
import {
  androidDiscovery,
  devicesFromScan,
} from '../src/infrastructure/discovery/androidDiscovery';
import NativeNetworkDiscovery from '../src/specs/NativeNetworkDiscovery';
import type { MdnsScan } from '../src/specs/NativeNetworkDiscovery';

jest.mock('../src/specs/NativeNetworkDiscovery', () => ({
  __esModule: true,
  default: {
    getNetworkInfo: jest.fn(),
    discover: jest.fn(),
    cancelDiscovery: jest.fn(),
  },
}));

const network = { address: '10.0.2.16', transport: 'Wi-Fi', emulator: true };
const service = {
  address: '192.168.1.20',
  name: 'Router de prueba',
  type: '_http._tcp.',
  port: 80,
};
const native = jest.mocked(NativeNetworkDiscovery!);
const originalOS = Platform.OS;
beforeAll(() => {
  Platform.OS = 'android';
});
afterAll(() => {
  Platform.OS = originalOS;
});
jest.useFakeTimers();
let app: ReactTestRenderer.ReactTestRenderer;
const navigate = jest.fn();
const repository = { saveDevices: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  native.getNetworkInfo.mockResolvedValue(network);
  repository.saveDevices.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (app) {
    await act(async () => app.unmount());
  }
});

async function render() {
  await act(async () => {
    app = ReactTestRenderer.create(
      <DevicesScreen
        navigation={{ navigate } as never}
        route={{ key: 'devices', name: 'Devices' }}
        repository={repository as never}
      />,
    );
  });
}
function button(label: string) {
  return app.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0]!;
}
function contents() {
  return JSON.stringify(app.toJSON());
}

test('agrupa servicios por IP sin inventar MAC ni usar el nombre de servicio como hostname', () => {
  const scan: MdnsScan = {
    network,
    warnings: [],
    services: [service, service, { ...service, type: '_ssh._tcp.', port: 22 }],
  };
  const devices = devicesFromScan(scan, 'sitio');
  expect(devices).toHaveLength(1);
  expect(devices[0]!.services).toHaveLength(2);
  expect(devices[0]!.mac).toBeUndefined();
  expect(devices[0]!.hostname).toBeUndefined();
});

test('preserva el hostname resuelto sin confundirlo con el nombre del servicio', () => {
  const scan: MdnsScan = {
    network,
    warnings: [],
    services: [{ ...service, hostname: 'router-lab' }],
  };
  const [device] = devicesFromScan(scan, 'sitio');
  expect(device!.hostname).toBe('router-lab');
  expect(device!.services![0]!.name).toBe('Router de prueba');
  expect(device!.mac).toBeUndefined();
});

test('conserva el hostname si llega en un segundo servicio de la misma IP', () => {
  const scan: MdnsScan = {
    network,
    warnings: [],
    services: [
      service,
      { ...service, type: '_ssh._tcp.', port: 22, hostname: 'router-lab' },
    ],
  };
  const [device] = devicesFromScan(scan, 'sitio');
  expect(device!.hostname).toBe('router-lab');
  expect(device!.services).toHaveLength(2);
});

test('una búsqueda vacía termina y muestra su alcance; no agrega equipos ficticios', async () => {
  native.discover.mockResolvedValue({ network, warnings: [], services: [] });
  await render();
  await act(async () => {
    await button('Buscar equipos').props.onPress();
  });
  expect(native.discover).toHaveBeenCalledWith(12000);
  expect(contents()).toContain('No se encontraron servicios mDNS');
  expect(contents()).toContain('red virtual del emulador');
  expect(button('Buscar equipos').props.disabled).toBe(false);
  expect(repository.saveDevices).not.toHaveBeenCalled();
});

test('guarda en el dispositivo los equipos encontrados', async () => {
  native.discover.mockResolvedValue({ network, warnings: [], services: [service] });
  await render();
  await act(async () => {
    await button('Buscar equipos').props.onPress();
  });
  expect(repository.saveDevices).toHaveBeenCalledTimes(1);
  const [devices] = repository.saveDevices.mock.calls[0];
  expect(devices).toEqual([
    expect.objectContaining({ ip: '192.168.1.20', siteId: 'sitio-local' }),
  ]);
  expect(contents()).toContain('1 equipo(s)');
});

test('el error de red queda visible y permite volver a intentar', async () => {
  native.discover.mockRejectedValue(
    new Error('No hay una red Wi-Fi o Ethernet con IPv4.'),
  );
  await render();
  await act(async () => {
    await button('Buscar equipos').props.onPress();
  });
  expect(contents()).toContain('No hay una red Wi-Fi o Ethernet');
  expect(button('Buscar equipos').props.disabled).toBe(false);
  native.discover.mockResolvedValue({
    network,
    warnings: [],
    services: [service],
  });
  await act(async () => {
    await button('Buscar equipos').props.onPress();
  });
  await act(async () => {
    button('Ver equipo 192.168.1.20').props.onPress();
  });
  expect(navigate).toHaveBeenCalledWith(
    'DeviceDetails',
    expect.objectContaining({
      device: expect.objectContaining({ ip: '192.168.1.20' }),
    }),
  );
});

test('evita búsquedas simultáneas, permite cancelar y vuelve a habilitar el botón', async () => {
  let rejectScan!: (error: Error) => void;
  native.discover.mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectScan = reject;
      }),
  );
  native.cancelDiscovery.mockImplementation(() => {
    rejectScan(new Error('Búsqueda cancelada.'));
  });
  await render();
  await act(async () => {
    button('Buscar equipos').props.onPress();
    button('Buscar equipos').props.onPress();
  });
  expect(native.discover).toHaveBeenCalledTimes(1);
  expect(button('Buscar equipos').props.disabled).toBe(true);
  await act(async () => {
    button('Cancelar búsqueda').props.onPress();
  });
  expect(native.cancelDiscovery).toHaveBeenCalledTimes(1);
  expect(contents()).toContain('Búsqueda cancelada.');
  expect(button('Buscar equipos').props.disabled).toBe(false);
});

test('al salir de la pantalla cancela el trabajo nativo', async () => {
  native.discover.mockImplementation(() => new Promise(() => {}));
  await render();
  await act(async () => {
    button('Buscar equipos').props.onPress();
  });
  await act(async () => {
    app.unmount();
  });
  expect(native.cancelDiscovery).toHaveBeenCalledTimes(1);
});

test('una señal ya cancelada no inicia tráfico de descubrimiento', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    androidDiscovery.discover({
      siteId: 'sitio',
      timeoutMs: 12000,
      signal: controller.signal,
    }),
  ).rejects.toThrow('cancelada');
  expect(native.discover).not.toHaveBeenCalled();
});
