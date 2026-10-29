import { migrate } from '../src/infrastructure/storage/schema';
import type {
  SqlDatabase,
  SqlExecutor,
  SqlValue,
} from '../src/infrastructure/storage/sql';
import { createSqliteRepository } from '../src/infrastructure/storage/sqliteRepository';
import { nextAttemptDelay, MAX_ATTEMPTS } from '../src/core/sync/outboxPolicy';
import type { OutboxAction, Installation } from '../src/core/domain/models';

// Jest define __filename; los tipos de React Native no lo declaran.
declare const __filename: string;

// node:sqlite (Node 22.5+) da un SQLite real en las pruebas, sin módulos nativos.
let sqlite: { DatabaseSync: new (path: string) => any } | null = null;
try {
  // createRequire evita el resolvedor de Jest, que no conoce node:sqlite.
  const { createRequire } = require('module');
  sqlite = createRequire(__filename)('node:sqlite');
} catch {
  sqlite = null;
}
const maybe = sqlite ? describe : describe.skip;

function memoryDb(): SqlDatabase {
  const raw = new sqlite!.DatabaseSync(':memory:');
  const exec: SqlExecutor = {
    async execute(sql: string, params: SqlValue[] = []) {
      const stmt = raw.prepare(sql);
      if (/^\s*(SELECT|PRAGMA user_version\s*$)/i.test(sql)) {
        return { rows: stmt.all(...params) };
      }
      stmt.run(...params);
      return { rows: [] };
    },
  };
  return {
    ...exec,
    async transaction(fn) {
      raw.exec('BEGIN');
      try {
        await fn(exec);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const installation: Installation = {
  id: 'inst-1',
  siteId: 'site-a',
  notes: 'ONT instalada',
  photos: [],
  createdAt: '2026-10-28T10:00:00.000Z',
  revision: 1,
};

function action(overrides: Partial<OutboxAction> = {}): OutboxAction {
  return {
    id: 'act-1',
    entityId: 'inst-1',
    entityRevision: 1,
    kind: 'installation.upsert',
    state: 'pending',
    attempts: 0,
    createdAt: '2026-10-28T10:00:00.000Z',
    ...overrides,
  };
}

maybe('repositorio SQLite', () => {
  async function setup() {
    const db = memoryDb();
    await migrate(db);
    return { db, repo: createSqliteRepository(db) };
  }

  it('migra una sola vez', async () => {
    const db = memoryDb();
    expect(await migrate(db)).toBe(1);
    expect(await migrate(db)).toBe(1);
  });

  it('guarda instalación y acción juntas', async () => {
    const { repo } = await setup();
    await repo.saveInstallationWithAction(installation, action());
    expect(await repo.findInstallation('inst-1')).toEqual(installation);
    expect(await repo.listPendingActions()).toHaveLength(1);
  });

  it('revierte ambas escrituras si falla la transacción', async () => {
    const { repo } = await setup();
    await repo.saveInstallationWithAction(installation, action());
    // Mismo id de acción en otra entidad: viola la PRIMARY KEY de outbox.
    await expect(
      repo.saveInstallationWithAction(
        { ...installation, id: 'inst-2' },
        action({ entityId: 'inst-2' }),
      ),
    ).rejects.toThrow();
    expect(await repo.findInstallation('inst-2')).toBeNull();
  });

  it('una revisión nueva reemplaza la acción pendiente', async () => {
    const { repo } = await setup();
    await repo.saveInstallationWithAction(installation, action());
    await repo.saveInstallationWithAction(
      { ...installation, revision: 2 },
      action({ id: 'act-2', entityRevision: 2 }),
    );
    const pending = await repo.listPendingActions();
    expect(pending.map(item => item.id)).toEqual(['act-2']);
  });

  it('aplica reintento con espera y recupera envíos interrumpidos', async () => {
    const { repo } = await setup();
    const now = new Date('2026-10-28T12:00:00.000Z');
    await repo.saveInstallationWithAction(installation, action());
    await repo.markSending('act-1');
    await repo.markFailed('act-1', 'sin red', now);
    expect(await repo.listReadyActions(now)).toHaveLength(0);
    const later = new Date(now.getTime() + nextAttemptDelay(1));
    expect(await repo.listReadyActions(later)).toHaveLength(1);
    await repo.markSending('act-1');
    expect(await repo.recoverInterrupted()).toBe(1);
    await repo.markSent('act-1');
    expect(await repo.listPendingActions()).toHaveLength(0);
  });

  it('marca failed al agotar intentos y permite reintento manual', async () => {
    const { repo } = await setup();
    const now = new Date('2026-10-28T12:00:00.000Z');
    await repo.saveInstallationWithAction(installation, action());
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await repo.markSending('act-1');
      await repo.markFailed('act-1', 'error', now);
    }
    expect((await repo.listPendingActions())[0].state).toBe('failed');
    expect(await repo.retryFailed()).toBe(1);
  });

  it('filtra historial por equipo y sitio', async () => {
    const { repo } = await setup();
    const base = {
      protocol: 'snmp' as const,
      finishedAt: '2026-10-28T10:00:01.000Z',
      status: 'success' as const,
      summary: 'ok',
    };
    await repo.saveDiagnosticWithAction(
      { ...base, id: 'd1', deviceId: 'dev-1', siteId: 'site-a', startedAt: '2026-10-28T10:00:00.000Z' },
      action({ id: 'a1', entityId: 'd1', kind: 'diagnostic.upsert' }),
    );
    await repo.saveDiagnosticWithAction(
      { ...base, id: 'd2', deviceId: 'dev-2', siteId: 'site-b', startedAt: '2026-10-28T11:00:00.000Z' },
      action({ id: 'a2', entityId: 'd2', kind: 'diagnostic.upsert' }),
    );
    expect((await repo.listDiagnostics({ deviceId: 'dev-1' })).map(d => d.id)).toEqual(['d1']);
    expect((await repo.listDiagnostics({ siteId: 'site-b' })).map(d => d.id)).toEqual(['d2']);
    expect(await repo.listSites()).toEqual(['site-a', 'site-b']);
  });
});

describe('política de reintentos', () => {
  it('duplica la espera con tope de 30 minutos', () => {
    expect(nextAttemptDelay(1)).toBe(30_000);
    expect(nextAttemptDelay(2)).toBe(60_000);
    expect(nextAttemptDelay(20)).toBe(30 * 60_000);
  });
});
