import { migrate } from '../src/infrastructure/storage/schema';
import { createSqliteRepository } from '../src/infrastructure/storage/sqliteRepository';
import { nextAttemptDelay, MAX_ATTEMPTS } from '../src/core/sync/outboxPolicy';
import type { OutboxAction, Installation } from '../src/core/domain/models';
import { hasSqlite, memoryDb } from '../test-support/memoryDb';

const maybe = hasSqlite ? describe : describe.skip;

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
    expect(await migrate(db)).toBe(3);
    expect(await migrate(db)).toBe(3);
  });

  it('guarda configuración local', async () => {
    const { repo } = await setup();
    expect(await repo.getSetting('backendUrl')).toBeNull();
    await repo.setSetting('backendUrl', 'http://10.0.2.2:3000');
    await repo.setSetting('backendUrl', 'http://192.168.0.10:3000');
    expect(await repo.getSetting('backendUrl')).toBe('http://192.168.0.10:3000');
  });

  it('rechazo permanente, conflicto y descarte de acciones', async () => {
    const { repo } = await setup();
    await repo.saveInstallationWithAction(installation, action());
    await repo.saveInstallationWithAction(
      { ...installation, id: 'inst-2' },
      action({ id: 'act-2', entityId: 'inst-2' }),
    );
    await repo.markRejected('act-1', 'datos inválidos');
    await repo.markConflict('act-2', 'el servidor tiene la revisión 3');
    const now = new Date('2026-10-28T12:00:00.000Z');
    expect(await repo.listReadyActions(now)).toHaveLength(0);
    expect(
      (await repo.listPendingActions()).map(a => [a.id, a.state, a.lastError]),
    ).toEqual([
      ['act-1', 'failed', 'datos inválidos'],
      ['act-2', 'conflict', 'el servidor tiene la revisión 3'],
    ]);
    await repo.discard('act-2');
    expect((await repo.listPendingActions()).map(a => a.id)).toEqual(['act-1']);
    expect(await repo.findInstallation('inst-2')).not.toBeNull();
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

  it('guarda reportes con su acción y los lista por instalación', async () => {
    const { repo } = await setup();
    const report = (id: string, installationId: string, createdAt: string) => ({
      id,
      installationId,
      installationRevision: 1,
      localPdfUri: `file:///data/reports/${id}.pdf`,
      createdAt,
    });
    await repo.saveReportWithAction(
      report('r1', 'inst-1', '2026-10-28T10:00:00.000Z'),
      action({ id: 'a1', entityId: 'r1', kind: 'report.upload' }),
    );
    await repo.saveReportWithAction(
      report('r2', 'inst-1', '2026-10-28T11:00:00.000Z'),
      action({ id: 'a2', entityId: 'r2', kind: 'report.upload' }),
    );
    await repo.saveReportWithAction(
      report('r3', 'inst-2', '2026-10-28T12:00:00.000Z'),
      action({ id: 'a3', entityId: 'r3', kind: 'report.upload' }),
    );
    expect((await repo.listReports('inst-1')).map(r => r.id)).toEqual(['r2', 'r1']);
    expect((await repo.listReports()).map(r => r.id)).toEqual(['r3', 'r2', 'r1']);
    expect(await repo.findReport('r3')).toEqual(
      report('r3', 'inst-2', '2026-10-28T12:00:00.000Z'),
    );
    expect((await repo.listPendingActions()).map(a => a.kind)).toEqual([
      'report.upload',
      'report.upload',
      'report.upload',
    ]);
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
    expect((await repo.findDiagnostic('d2'))?.siteId).toBe('site-b');
    expect(await repo.findDiagnostic('nada')).toBeNull();
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
