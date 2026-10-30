import type {
  Diagnostic,
  Installation,
  InstallationReport,
} from '../src/core/domain/models';
import { createOutboxAction } from '../src/core/sync/outboxAction';
import {
  createHttpTransport,
  normalizeBackendUrl,
  outcomeFor,
} from '../src/features/sync/httpTransport';
import {
  describeSummary,
  runSync,
  type ActionPayload,
  type FilePayload,
  type LocalFileReader,
  type SendOutcome,
  type SyncDeps,
  type SyncTransport,
} from '../src/features/sync/syncEngine';
import { migrate } from '../src/infrastructure/storage/schema';
import { createSqliteRepository } from '../src/infrastructure/storage/sqliteRepository';
import { hasSqlite, memoryDb } from '../test-support/memoryDb';

const { startBackend } = require('../backend/server.cjs');
const crypto = require('crypto');

const maybe = hasSqlite ? describe : describe.skip;
const NOW = new Date('2026-10-29T12:00:00.000Z');

const diagnostic: Diagnostic = {
  id: 'diag-1',
  deviceId: 'manual:10.0.2.2',
  siteId: 'sitio-local',
  protocol: 'snmp',
  startedAt: '2026-10-29T11:00:00.000Z',
  finishedAt: '2026-10-29T11:00:01.000Z',
  status: 'success',
  summary: 'ok',
};

const installation: Installation = {
  id: 'inst-1',
  siteId: 'torre-norte',
  notes: 'ONT instalada',
  photos: [
    { id: 'photo-1', localUri: 'file:///evidence/photo-1.jpg', capturedAt: '2026-10-29T11:00:00.000Z' },
    { id: 'photo-2', localUri: 'file:///evidence/photo-2.jpg', capturedAt: '2026-10-29T11:01:00.000Z' },
  ],
  createdAt: '2026-10-29T11:05:00.000Z',
  revision: 1,
};

const report: InstallationReport = {
  id: 'rep-inst-1-r1',
  installationId: 'inst-1',
  installationRevision: 1,
  localPdfUri: 'file:///reports/rep-inst-1-r1.pdf',
  createdAt: '2026-10-29T11:10:00.000Z',
};

// Lector de archivos simulado: contenido = la ruta, salvo las que "faltan".
function fakeFiles(missing: string[] = []): LocalFileReader {
  return {
    async read(uri) {
      if (missing.includes(uri)) return null;
      return {
        dataBase64: Buffer.from(uri).toString('base64'),
        sha256: crypto.createHash('sha256').update(uri).digest('hex'),
      };
    },
  };
}
declare const Buffer: { from(data: string, encoding?: string): { toString(encoding: string): string } };

async function setup() {
  const db = memoryDb();
  await migrate(db);
  const repo = createSqliteRepository(db);
  return repo;
}

async function seed(repo: Awaited<ReturnType<typeof setup>>) {
  // Distintos instantes para que el orden de envío sea el de creación.
  await repo.saveInstallationWithAction(
    installation,
    { ...createOutboxAction('installation.upsert', installation.id, 1, NOW), createdAt: '2026-10-29T11:05:00.000Z' },
  );
  await repo.saveReportWithAction(
    report,
    { ...createOutboxAction('report.upload', report.id, 1, NOW), createdAt: '2026-10-29T11:10:00.000Z' },
  );
  await repo.saveDiagnosticWithAction(
    diagnostic,
    { ...createOutboxAction('diagnostic.upsert', diagnostic.id, 1, NOW), createdAt: '2026-10-29T11:15:00.000Z' },
  );
}

function recordingTransport(outcomes: SendOutcome[] = [], reachable = true) {
  const calls: { type: 'file' | 'action'; payload: FilePayload | ActionPayload }[] = [];
  const queue = [...outcomes];
  const next = async () => queue.shift() ?? { kind: 'ok' as const };
  const transport: SyncTransport = {
    health: async () => reachable,
    uploadFile: async payload => {
      calls.push({ type: 'file', payload });
      return { kind: 'ok' };
    },
    sendAction: async payload => {
      calls.push({ type: 'action', payload });
      return next();
    },
  };
  return { transport, calls };
}

function deps(repo: Awaited<ReturnType<typeof setup>>, transport: SyncTransport, files = fakeFiles()): SyncDeps {
  return { repository: repo, outbox: repo, transport, files, now: () => NOW };
}

maybe('motor de sincronización', () => {
  it('sin backend no toca la cola', async () => {
    const repo = await setup();
    await seed(repo);
    const { transport, calls } = recordingTransport([], false);
    const summary = await runSync(deps(repo, transport));
    expect(summary).toMatchObject({ reachable: false, sent: 0 });
    expect(calls).toHaveLength(0);
    expect((await repo.listPendingActions()).every(a => a.state === 'pending' && a.attempts === 0)).toBe(true);
    expect(describeSummary(summary)).toMatch(/siguen guardados en el teléfono/u);
  });

  it('sube los archivos antes de cada acción y no envía rutas locales', async () => {
    const repo = await setup();
    await seed(repo);
    const { transport, calls } = recordingTransport();
    const summary = await runSync(deps(repo, transport));
    expect(summary).toMatchObject({ reachable: true, sent: 3, interrupted: false });
    expect(calls.map(c => (c.type === 'file' ? `file:${(c.payload as FilePayload).fileId}` : (c.payload as ActionPayload).kind))).toEqual([
      'file:photo-1',
      'file:photo-2',
      'installation.upsert',
      'file:rep-inst-1-r1',
      'report.upload',
      'diagnostic.upsert',
    ]);
    const sent = JSON.stringify(calls.filter(c => c.type === 'action'));
    expect(sent).not.toContain('file:///');
    expect(sent).toContain('"fileId":"photo-1"');
    expect(await repo.listPendingActions()).toHaveLength(0);
  });

  it('un fallo temporal reprograma la acción y corta la ronda', async () => {
    const repo = await setup();
    await seed(repo);
    const { transport } = recordingTransport([{ kind: 'ok' }, { kind: 'temporary', message: 'HTTP 503' }]);
    const summary = await runSync(deps(repo, transport));
    expect(summary).toMatchObject({ sent: 1, retrying: 1, interrupted: true });
    const pending = await repo.listPendingActions();
    expect(pending.map(a => [a.kind, a.state, a.attempts])).toEqual([
      ['report.upload', 'pending', 1],
      ['diagnostic.upsert', 'pending', 0],
    ]);
    expect(pending[0].nextAttemptAt).toBe(new Date(NOW.getTime() + 30_000).toISOString());
    expect(pending[0].lastError).toBe('HTTP 503');
    expect(describeSummary(summary)).toMatch(/Se interrumpió/u);
  });

  it('registra conflictos y rechazos sin borrar datos locales', async () => {
    const repo = await setup();
    await seed(repo);
    const { transport } = recordingTransport([
      { kind: 'conflict', message: 'El servidor ya tiene la revisión 2 de esta entidad.' },
      { kind: 'permanent', message: 'Acción inválida.' },
    ]);
    const summary = await runSync(deps(repo, transport));
    expect(summary).toMatchObject({ sent: 1, conflicts: 1, rejected: 1 });
    expect((await repo.listPendingActions()).map(a => [a.kind, a.state, a.lastError])).toEqual([
      ['installation.upsert', 'conflict', 'El servidor ya tiene la revisión 2 de esta entidad.'],
      ['report.upload', 'failed', 'Acción inválida.'],
    ]);
    expect(await repo.findInstallation('inst-1')).toEqual(installation);
    expect(await repo.listReadyActions(NOW)).toHaveLength(0);
  });

  it('rechaza la acción si falta un archivo local', async () => {
    const repo = await setup();
    await seed(repo);
    const { transport, calls } = recordingTransport();
    const summary = await runSync(deps(repo, transport, fakeFiles(['file:///evidence/photo-2.jpg'])));
    expect(summary.rejected).toBe(1);
    expect(calls.some(c => c.type === 'action' && (c.payload as ActionPayload).kind === 'installation.upsert')).toBe(false);
    expect((await repo.listPendingActions())[0].lastError).toBe('Falta el archivo local photo-2.');
  });
});

maybe('sincronización contra el backend de laboratorio', () => {
  let backend: { port: number; state: any; close(): Promise<void> };
  beforeEach(async () => {
    backend = await startBackend({ port: 0 });
  });
  afterEach(async () => {
    await backend.close();
  });

  function http() {
    return createHttpTransport(`http://127.0.0.1:${backend.port}`, { timeoutMs: 3000 });
  }

  it('envía todo una vez y el backend guarda entidades y archivos', async () => {
    const repo = await setup();
    await seed(repo);
    const summary = await runSync(deps(repo, http()));
    expect(summary).toMatchObject({ reachable: true, sent: 3 });
    expect(Object.keys(backend.state.entities).sort()).toEqual([
      'diagnostic.upsert:diag-1',
      'installation.upsert:inst-1',
      'report.upload:rep-inst-1-r1',
    ]);
    expect(Object.keys(backend.state.files).sort()).toEqual(['photo-1', 'photo-2', 'rep-inst-1-r1']);
    expect((await runSync(deps(repo, http()))).sent).toBe(0);
  });

  it('si la app se cerró en pleno envío, reenviar no duplica', async () => {
    const repo = await setup();
    await seed(repo);
    await runSync(deps(repo, http()));
    // Simula un envío que llegó al backend pero cuya confirmación no se guardó.
    const action = createOutboxAction('diagnostic.upsert', diagnostic.id, 1, NOW);
    await repo.saveDiagnosticWithAction(diagnostic, action);
    await runSync(deps(repo, http()));
    await repo.saveDiagnosticWithAction(diagnostic, action);
    await repo.markSending(action.id);
    expect(await repo.recoverInterrupted()).toBe(1);
    expect((await runSync(deps(repo, http()))).sent).toBe(1);
    expect(Object.values(backend.state.actions).filter((a: any) => a.entityId === 'diag-1')).toHaveLength(2);
  });

  it('una revisión vieja queda en conflicto y se puede descartar conservando los datos', async () => {
    const repo = await setup();
    await repo.saveDiagnosticWithAction(diagnostic, createOutboxAction('diagnostic.upsert', diagnostic.id, 1, NOW));
    // Otro técnico ya subió la revisión 2 del mismo diagnóstico.
    await http().sendAction({
      actionId: 'otro-tecnico',
      kind: 'diagnostic.upsert',
      entityId: diagnostic.id,
      revision: 2,
      entity: { ...diagnostic, summary: 'editado por otro' },
    });
    const summary = await runSync(deps(repo, http()));
    expect(summary.conflicts).toBe(1);
    const [conflict] = await repo.listPendingActions();
    expect(conflict.lastError).toBe('El servidor ya tiene la revisión 2 de esta entidad.');
    await repo.discard(conflict.id);
    expect(await repo.listPendingActions()).toHaveLength(0);
    expect(await repo.findDiagnostic(diagnostic.id)).toEqual(diagnostic);
  });

  it('con el backend apagado las acciones siguen pendientes y sin intentos', async () => {
    const repo = await setup();
    await seed(repo);
    await backend.close();
    const summary = await runSync(deps(repo, http()));
    expect(summary.reachable).toBe(false);
    expect((await repo.listPendingActions()).map(a => a.attempts)).toEqual([0, 0, 0]);
  });
});

describe('transporte HTTP', () => {
  it.each([
    [200, 'ok'],
    [409, 'conflict'],
    [408, 'temporary'],
    [429, 'temporary'],
    [503, 'temporary'],
    [422, 'permanent'],
    [404, 'permanent'],
  ])('HTTP %i se trata como %s', (status, kind) => {
    expect(outcomeFor(status, 'x').kind).toBe(kind);
  });

  it('valida la URL del backend', () => {
    expect(normalizeBackendUrl(' http://192.168.0.10:3000/ ')).toBe('http://192.168.0.10:3000');
    expect(normalizeBackendUrl('https://backend.local')).toBe('https://backend.local');
    expect(normalizeBackendUrl('ftp://x')).toBeNull();
    expect(normalizeBackendUrl('http://x:3000/sync')).toBeNull();
  });

  it('un error de red es temporal', async () => {
    const transport = createHttpTransport('http://127.0.0.1:1', {
      fetchImpl: (() => Promise.reject(new Error('sin red'))) as never,
    });
    expect(await transport.health()).toBe(false);
    expect((await transport.sendAction({} as ActionPayload)).kind).toBe('temporary');
  });
});
