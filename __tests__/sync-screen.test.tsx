import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { OutboxAction } from '../src/core/domain/models';
import type { LocalRepository, OutboxStore } from '../src/features/local-store/contracts';
import { SyncScreen } from '../src/features/sync/SyncScreen';
import {
  createSyncController,
  type SyncController,
} from '../src/features/sync/syncController';
import type { SyncSummary } from '../src/features/sync/syncEngine';

const action = (id: string, state: OutboxAction['state'], lastError?: string): OutboxAction => ({
  id,
  entityId: `ent-${id}`,
  entityRevision: 1,
  kind: 'diagnostic.upsert',
  state,
  attempts: 0,
  createdAt: '2026-10-29T12:00:00.000Z',
  lastError,
});

function setup(actions: OutboxAction[], summary?: SyncSummary) {
  let queue = [...actions];
  const settings: Record<string, string> = {};
  const repository = {
    listPendingActions: jest.fn(async () => queue),
    getSetting: jest.fn(async (key: string) => settings[key] ?? null),
    setSetting: jest.fn(async (key: string, value: string) => {
      settings[key] = value;
    }),
    discard: jest.fn(async (id: string) => {
      queue = queue.filter(a => a.id !== id);
    }),
    retryFailed: jest.fn(async () => {
      queue = queue.map(a => (a.state === 'failed' ? { ...a, state: 'pending' } : a));
      return 1;
    }),
  } as unknown as LocalRepository & OutboxStore;
  const round = jest.fn(async () => {
    queue = [];
    return (
      summary ?? { reachable: true, sent: 1, conflicts: 0, retrying: 0, rejected: 0, interrupted: false }
    );
  });
  const controller: SyncController = createSyncController({ round });
  return { repository, controller, round, settings };
}

async function render(services: { repository: LocalRepository & OutboxStore; controller: SyncController }) {
  let screen!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    screen = ReactTestRenderer.create(<SyncScreen services={services} />);
  });
  return screen;
}

const text = (screen: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(screen.toJSON());

function press(screen: ReactTestRenderer.ReactTestRenderer, label: string) {
  const node = screen.root.find(
    n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  return act(async () => {
    await node.props.onPress();
  });
}

test('muestra la cola agrupada y la URL por defecto', async () => {
  const deps = setup([
    action('a-1', 'pending'),
    action('a-2', 'conflict', 'El servidor tiene la revisión 2.'),
    action('a-3', 'failed', 'Falta el archivo local photo-1.'),
  ]);
  const screen = await render(deps);
  const out = text(screen);
  expect(out).toContain('Pendientes (1)');
  expect(out).toContain('En conflicto (1)');
  expect(out).toContain('El servidor tiene la revisión 2.');
  expect(out).toContain('Fallidas (1)');
  expect(out).toContain('Todavía no se sincronizó en esta sesión.');
  expect(screen.root.findByProps({ accessibilityLabel: 'URL del backend' }).props.value).toBe(
    'http://10.0.2.2:3000',
  );
});

test('Sincronizar ahora corre una ronda y actualiza la cola', async () => {
  const deps = setup([action('a-1', 'pending')]);
  const screen = await render(deps);
  await press(screen, 'Sincronizar ahora');
  expect(deps.round).toHaveBeenCalledTimes(1);
  expect(text(screen)).toContain('No hay envíos pendientes');
  expect(text(screen)).toMatch(/Última ronda \(manual\)[^"]*1 enviada\(s\)\./u);
});

test('avisa si el backend no respondió', async () => {
  const deps = setup([action('a-1', 'pending')], {
    reachable: false,
    sent: 0,
    conflicts: 0,
    retrying: 0,
    rejected: 0,
    interrupted: false,
  });
  const screen = await render(deps);
  await press(screen, 'Sincronizar ahora');
  expect(text(screen)).toContain('Backend no disponible');
});

test('descartar un conflicto quita solo el envío', async () => {
  const deps = setup([action('a-2', 'conflict', 'conflicto')]);
  const screen = await render(deps);
  await press(screen, 'Descartar Diagnóstico · ent-a-2 · rev. 1');
  expect(deps.repository.discard).toHaveBeenCalledWith('a-2');
  expect(text(screen)).toContain('Envío descartado.');
  expect(text(screen)).not.toContain('En conflicto');
});

test('reintentar fallidas las vuelve a la cola y sincroniza', async () => {
  const deps = setup([action('a-3', 'failed', 'rechazada')]);
  const screen = await render(deps);
  await press(screen, 'Reintentar fallidas');
  expect(deps.repository.retryFailed).toHaveBeenCalled();
  expect(deps.round).toHaveBeenCalledTimes(1);
});

test('valida y guarda la URL del backend', async () => {
  const deps = setup([]);
  const screen = await render(deps);
  const input = () => screen.root.findByProps({ accessibilityLabel: 'URL del backend' });
  await act(async () => input().props.onChangeText('10.0.2.2:3000/sync'));
  await press(screen, 'Guardar URL');
  expect(text(screen)).toContain('URL inválida');
  expect(deps.repository.setSetting).not.toHaveBeenCalled();

  await act(async () => input().props.onChangeText(' http://192.168.0.10:3000/ '));
  await press(screen, 'Guardar URL');
  expect(deps.settings.backendUrl).toBe('http://192.168.0.10:3000');
  expect(input().props.value).toBe('http://192.168.0.10:3000');
});

test('muestra las rondas automáticas que terminan con la pantalla abierta', async () => {
  const deps = setup([action('a-1', 'pending')]);
  const screen = await render(deps);
  await act(async () => {
    await deps.controller.syncNow('red');
  });
  expect(text(screen)).toContain('Última ronda (al volver la red)');
  expect(text(screen)).toContain('No hay envíos pendientes');
});
