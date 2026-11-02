import type { OutboxAction } from '../src/core/domain/models';
import { createOutboxAction } from '../src/core/sync/outboxAction';
import {
  BACKEND_URL_SETTING,
  RELEASE_HTTP_HOSTS,
  createHttpTransport,
  releaseBlocksHttp,
} from '../src/features/sync/httpTransport';
import {
  backendUrlOf,
  createSyncController,
  createSyncRound,
} from '../src/features/sync/syncController';
import type { SyncSummary } from '../src/features/sync/syncEngine';
import { describeAction, describeRound, queueView } from '../src/features/sync/syncView';
import { migrate } from '../src/infrastructure/storage/schema';
import { createSqliteRepository } from '../src/infrastructure/storage/sqliteRepository';
import { hasSqlite, memoryDb } from '../test-support/memoryDb';

const { startBackend } = require('../backend/server.cjs');

const maybe = hasSqlite ? describe : describe.skip;

const summary: SyncSummary = {
  reachable: true,
  sent: 1,
  conflicts: 0,
  retrying: 0,
  rejected: 0,
  interrupted: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('controlador de sincronización', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('no corre dos rondas a la vez', async () => {
    const pending = deferred<SyncSummary>();
    const round = jest.fn(() => pending.promise);
    const controller = createSyncController({ round });
    const first = controller.syncNow('manual');
    const second = controller.syncNow('periodica');
    expect(second).toBe(first);
    expect(controller.getState().running).toBe(true);
    pending.resolve(summary);
    const result = await first;
    expect(round).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ trigger: 'manual', summary });
    expect(controller.getState()).toEqual({ running: false, last: result });
  });

  it('avisa a los suscriptores al empezar y al terminar', async () => {
    const controller = createSyncController({ round: async () => summary });
    const states: boolean[] = [];
    const unsubscribe = controller.subscribe(state => states.push(state.running));
    await controller.syncNow();
    unsubscribe();
    await controller.syncNow();
    expect(states).toEqual([true, false]);
  });

  it('informa el error si la ronda no pudo empezar', async () => {
    const controller = createSyncController({
      round: async () => {
        throw new Error('base cerrada');
      },
    });
    expect(await controller.syncNow()).toMatchObject({ error: 'base cerrada' });
    expect(controller.getState().running).toBe(false);
  });

  it('sincroniza solo cuando la red vuelve, no con cada aviso', async () => {
    const round = jest.fn(async () => summary);
    const controller = createSyncController({ round });
    controller.networkChanged(true);
    controller.networkChanged(true);
    expect(round).not.toHaveBeenCalled();
    controller.networkChanged(false);
    controller.networkChanged(true);
    await Promise.resolve();
    expect(round).toHaveBeenCalledTimes(1);
  });

  it('sincroniza al empezar y cada intervalo hasta que se detiene', async () => {
    jest.useFakeTimers();
    const round = jest.fn(async () => summary);
    const controller = createSyncController({ round, intervalMs: 60_000 });
    controller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(round).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(round).toHaveBeenCalledTimes(2);
    controller.stop();
    jest.advanceTimersByTime(180_000);
    expect(round).toHaveBeenCalledTimes(2);
  });
});

describe('HTTP en release', () => {
  it('solo permite HTTP hacia la PC del laboratorio', () => {
    expect(releaseBlocksHttp('http://10.0.2.2:3000')).toBe(false);
    expect(releaseBlocksHttp('http://127.0.0.1:3000')).toBe(false);
    expect(releaseBlocksHttp('http://LOCALHOST:3000')).toBe(false);
    expect(releaseBlocksHttp('http://192.168.0.10:3000')).toBe(true);
    expect(releaseBlocksHttp('http://10.0.2.20')).toBe(true);
    expect(releaseBlocksHttp('https://192.168.0.10')).toBe(false);
  });

  it('coincide con network_security_config.xml', () => {
    // Jest corre desde la raíz del proyecto.
    const xml: string = require('fs').readFileSync(
      'android/app/src/main/res/xml/network_security_config.xml',
      'utf8',
    );
    expect(xml).toContain('<base-config cleartextTrafficPermitted="false" />');
    const hosts = [...xml.matchAll(/<domain [^>]*>([^<]+)<\/domain>/gu)].map(m => m[1]);
    expect(hosts.sort()).toEqual([...RELEASE_HTTP_HOSTS].sort());
  });
});

describe('vista de la cola', () => {
  const base: OutboxAction = {
    ...createOutboxAction('report.upload', 'rep-inst-1-r1', 1, new Date('2026-10-29T12:00:00Z')),
    id: 'a-1',
  };

  it('agrupa por estado y explica cada acción', () => {
    const view = queueView([
      base,
      { ...base, id: 'a-2', attempts: 2, nextAttemptAt: '2026-10-29T12:02:00Z', lastError: 'HTTP 503' },
      { ...base, id: 'a-3', state: 'conflict', lastError: 'El servidor tiene la revisión 2.' },
      { ...base, id: 'a-4', state: 'failed', lastError: 'Falta el archivo local.' },
    ]);
    expect(view.pending.map(e => e.id)).toEqual(['a-1', 'a-2']);
    expect(view.conflicts.map(e => e.id)).toEqual(['a-3']);
    expect(view.failed.map(e => e.id)).toEqual(['a-4']);
    expect(view.pending[0]!.title).toBe('Reporte PDF · rep-inst-1-r1 · rev. 1');
    expect(view.pending[0]!.details).toEqual(['Esperando envío.']);
    expect(view.pending[1]!.details[0]).toMatch(/^2 intento\(s\) fallido\(s\) · próximo intento \d{2}\/\d{2}\/2026/u);
    expect(view.pending[1]!.details[1]).toBe('HTTP 503');
  });

  it('muestra las acciones en envío', () => {
    expect(describeAction({ ...base, state: 'sending' }).details).toEqual(['Enviando…']);
  });

  it('resume la última ronda', () => {
    const at = '2026-10-29T12:00:00Z';
    expect(
      describeRound({ trigger: 'red', startedAt: at, finishedAt: at, summary }),
    ).toMatch(/^Última ronda \(al volver la red\) .+: 1 enviada\(s\)\.$/u);
    expect(
      describeRound({ trigger: 'manual', startedAt: at, finishedAt: at, error: 'base cerrada' }),
    ).toMatch(/no se pudo sincronizar \(base cerrada\)\.$/u);
  });
});

maybe('ronda con la base y el backend reales', () => {
  async function setup() {
    const db = memoryDb();
    await migrate(db);
    return createSqliteRepository(db);
  }

  it('usa la URL guardada o la del emulador por defecto', async () => {
    const repo = await setup();
    expect(await backendUrlOf(repo)).toBe('http://10.0.2.2:3000');
    await repo.setSetting(BACKEND_URL_SETTING, 'http://192.168.0.10:3000');
    expect(await backendUrlOf(repo)).toBe('http://192.168.0.10:3000');
    await repo.setSetting(BACKEND_URL_SETTING, 'no es una url');
    expect(await backendUrlOf(repo)).toBe('http://10.0.2.2:3000');
  });

  it('envía la cola al backend configurado', async () => {
    const backend = await startBackend({ port: 0 });
    try {
      const repo = await setup();
      const now = new Date('2026-10-29T12:00:00.000Z');
      await repo.saveDiagnosticWithAction(
        {
          id: 'diag-1',
          deviceId: 'manual:10.0.2.2',
          siteId: 'sitio-local',
          protocol: 'snmp',
          startedAt: now.toISOString(),
          finishedAt: now.toISOString(),
          status: 'success',
          summary: 'ok',
        },
        createOutboxAction('diagnostic.upsert', 'diag-1', 1, now),
      );
      const url = `http://127.0.0.1:${backend.port}`;
      await repo.setSetting(BACKEND_URL_SETTING, url);
      const urls: string[] = [];
      const round = createSyncRound({
        open: async () => repo,
        files: { read: async () => null },
        transportFor: baseUrl => {
          urls.push(baseUrl);
          return createHttpTransport(baseUrl, { timeoutMs: 3000 });
        },
        now: () => now,
      });
      expect(await round()).toMatchObject({ reachable: true, sent: 1 });
      expect(urls).toEqual([url]);
      expect(await repo.listPendingActions()).toEqual([]);
    } finally {
      await backend.close();
    }
  });
});
