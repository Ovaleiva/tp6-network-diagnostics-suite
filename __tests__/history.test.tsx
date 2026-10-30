import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { Diagnostic } from '../src/core/domain/models';
import { HistoryScreen } from '../src/features/history/HistoryScreen';
import {
  describeDiagnostic,
  deviceLabel,
  devicesIn,
  filterByDevice,
} from '../src/features/history/historyView';

const snmp = {
  id: 'snmp-1',
  deviceId: 'manual:10.0.2.2',
  siteId: 'sitio-local',
  protocol: 'snmp',
  startedAt: '2026-10-29T21:48:35.815Z',
  finishedAt: '2026-10-29T21:48:35.853Z',
  status: 'success',
  summary: 'SNMP ok',
  snmp: { sysName: 'TP6-LAB-PC', uptimeTicks: 81305, interfaceIndex: 1, inOctets: 89, outOctets: 0 },
} as Diagnostic;

const ssh = {
  id: 'ssh-1',
  deviceId: 'router-1',
  siteId: 'torre-norte',
  protocol: 'ssh',
  startedAt: '2026-10-29T22:50:00.000Z',
  finishedAt: '2026-10-29T22:50:01.000Z',
  status: 'success',
  summary: 'SSH ok',
  ssh: {
    profile: 'linux',
    command: 'interfaces',
    commandLine: 'ip -brief address',
    port: 22,
    exitStatus: 0,
    output: 'eth0 UP 192.0.2.10/24\n',
    outputTruncated: false,
    hostKeyFingerprint: 'SHA256:huella',
    interfaces: [{ name: 'eth0', state: 'UP', addresses: ['192.0.2.10/24'] }],
  },
} as Diagnostic;

const legacy: Diagnostic = {
  id: 'old-1',
  deviceId: 'router-1',
  siteId: 'torre-norte',
  protocol: 'snmp',
  startedAt: '2026-10-28T10:00:00.000Z',
  finishedAt: '2026-10-28T10:00:01.000Z',
  status: 'timeout',
  summary: 'Registro sin datos estructurados.',
};

describe('vista del historial', () => {
  it('describe un diagnóstico SNMP', () => {
    const entry = describeDiagnostic(snmp);
    expect(entry.title).toBe('SNMP · TP6-LAB-PC');
    expect(entry.subtitle).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2} · 10\.0\.2\.2 \(manual\)$/u);
    expect(entry.details).toEqual([
      'Uptime del agente: 13 min',
      'Interfaz 1: entrada 89 y salida 0 octetos acumulados',
    ]);
  });

  it('describe un diagnóstico SSH con interfaces y salida', () => {
    const entry = describeDiagnostic(ssh);
    expect(entry.title).toBe('SSH · ip -brief address');
    expect(entry.details).toContain('eth0 · UP · 192.0.2.10/24');
    expect(entry.details).toContain('Huella del equipo: SHA256:huella');
    expect(entry.output).toBe('eth0 UP 192.0.2.10/24\n');
  });

  it('usa el resumen si el registro no tiene datos estructurados', () => {
    expect(describeDiagnostic(legacy)).toMatchObject({
      title: 'SNMP',
      status: 'timeout',
      details: ['Registro sin datos estructurados.'],
    });
  });

  it('lista equipos y filtra por equipo', () => {
    expect(devicesIn([snmp, ssh, legacy])).toEqual(['manual:10.0.2.2', 'router-1']);
    expect(filterByDevice([snmp, ssh, legacy], 'router-1').map(d => d.id)).toEqual(['ssh-1', 'old-1']);
    expect(filterByDevice([snmp, ssh], undefined)).toHaveLength(2);
    expect(deviceLabel('router-1')).toBe('router-1');
  });
});

describe('pantalla Historial', () => {
  let app: ReactTestRenderer.ReactTestRenderer;
  let repository: { listSites: jest.Mock; listDiagnostics: jest.Mock };

  async function render(items: Diagnostic[] = [ssh, snmp, legacy]) {
    repository = {
      listSites: jest.fn().mockResolvedValue(['sitio-local', 'torre-norte']),
      listDiagnostics: jest.fn(async ({ siteId }: { siteId?: string }) =>
        items.filter(item => !siteId || item.siteId === siteId),
      ),
    };
    await act(async () => {
      app = ReactTestRenderer.create(<HistoryScreen repository={repository as never} />);
    });
  }

  afterEach(async () => {
    await act(async () => app.unmount());
  });

  function press(label: string) {
    return act(async () => {
      app.root
        .find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')
        .props.onPress();
    });
  }

  const text = () => JSON.stringify(app.toJSON());

  it('muestra todos los diagnósticos del teléfono', async () => {
    await render();
    expect(repository.listDiagnostics).toHaveBeenCalledWith({});
    expect(text()).toContain('3 diagnóstico(s)');
    expect(text()).toContain('SNMP · TP6-LAB-PC');
    expect(text()).toContain('SSH · ip -brief address');
  });

  it('filtra por sitio desde la base y luego por equipo', async () => {
    await render();
    await press('Filtrar torre-norte');
    expect(repository.listDiagnostics).toHaveBeenLastCalledWith({ siteId: 'torre-norte' });
    expect(text()).toContain('2 diagnóstico(s)');
    expect(text()).not.toContain('TP6-LAB-PC');
    // En ese sitio hay un solo equipo: el filtro por equipo no hace falta.
    expect(text()).not.toContain('Todos los equipos');
  });

  it('el filtro por equipo aparece si hay más de uno', async () => {
    await render();
    await press('Filtrar 10.0.2.2 (manual)');
    expect(text()).toContain('1 diagnóstico(s)');
    expect(text()).toContain('SNMP · TP6-LAB-PC');
  });

  it('expande un registro para ver detalle y salida', async () => {
    await render();
    expect(text()).not.toContain('Huella del equipo');
    const title = describeDiagnostic(ssh);
    await press(`${title.title}, ${title.subtitle}`);
    expect(text()).toContain('Huella del equipo: SHA256:huella');
    expect(text()).toContain('eth0 UP 192.0.2.10/24');
  });

  it('indica cuando no hay diagnósticos', async () => {
    await render([]);
    expect(text()).toContain('Todavía no hay diagnósticos guardados');
  });

  it('informa si no puede leer la base', async () => {
    await render();
    repository.listDiagnostics.mockRejectedValueOnce(new Error('base bloqueada'));
    await press('Actualizar historial');
    expect(text()).toContain('No se pudo leer el historial: base bloqueada');
  });
});
