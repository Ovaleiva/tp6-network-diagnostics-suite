import type {
  Device,
  Diagnostic,
  EntityId,
  Installation,
  InstallationReport,
  OutboxAction,
} from '../../core/domain/models';
import {
  nextAttemptAt,
  shouldGiveUp,
} from '../../core/sync/outboxPolicy';
import type {
  LocalRepository,
  OutboxStore,
} from '../../features/local-store/contracts';
import type { SqlExecutor, SqlDatabase, SqlRow } from './sql';

function parse<T>(row: SqlRow): T {
  return JSON.parse(String(row.payload)) as T;
}

function toAction(row: SqlRow): OutboxAction {
  return {
    id: String(row.id),
    entityId: String(row.entity_id),
    entityRevision: Number(row.entity_revision),
    kind: row.kind as OutboxAction['kind'],
    state: row.state as OutboxAction['state'],
    attempts: Number(row.attempts),
    createdAt: String(row.created_at),
    ...(row.next_attempt_at
      ? { nextAttemptAt: String(row.next_attempt_at) }
      : {}),
    ...(row.last_error ? { lastError: String(row.last_error) } : {}),
  };
}

async function enqueue(tx: SqlExecutor, action: OutboxAction) {
  // Una acción pendiente por entidad y tipo: la nueva revisión reemplaza a la vieja.
  await tx.execute(
    "DELETE FROM outbox WHERE entity_id = ? AND kind = ? AND state IN ('pending','failed')",
    [action.entityId, action.kind],
  );
  await tx.execute(
    `INSERT INTO outbox (id, entity_id, entity_revision, kind, state, attempts,
      created_at, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      action.id,
      action.entityId,
      action.entityRevision,
      action.kind,
      'pending',
      0,
      action.createdAt,
      action.nextAttemptAt ?? null,
    ],
  );
}

export function createSqliteRepository(
  db: SqlDatabase,
): LocalRepository & OutboxStore {
  async function one<T>(sql: string, params: string[]): Promise<T | null> {
    const { rows } = await db.execute(sql, params);
    return rows[0] ? parse<T>(rows[0]) : null;
  }

  async function setState(id: EntityId, sql: string, params: unknown[]) {
    await db.execute(sql, [...(params as (string | number)[]), id]);
  }

  return {
    async saveDevices(devices) {
      await db.transaction(async tx => {
        for (const device of devices) {
          await tx.execute(
            `INSERT OR REPLACE INTO devices (id, site_id, ip, payload, discovered_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              device.id,
              device.siteId,
              device.ip,
              JSON.stringify(device),
              device.discoveredAt,
            ],
          );
        }
      });
    },
    findDevice: id => one<Device>('SELECT payload FROM devices WHERE id = ?', [id]),
    async listDevices(siteId) {
      const { rows } = await db.execute(
        'SELECT payload FROM devices WHERE site_id = ? ORDER BY ip',
        [siteId],
      );
      return rows.map(row => parse<Device>(row));
    },
    async listSites() {
      const { rows } = await db.execute(
        `SELECT site_id FROM devices UNION SELECT site_id FROM diagnostics
         UNION SELECT site_id FROM installations ORDER BY site_id`,
      );
      return rows.map(row => String(row.site_id));
    },
    findDiagnostic: id =>
      one<Diagnostic>('SELECT payload FROM diagnostics WHERE id = ?', [id]),
    async listDiagnostics({ deviceId, siteId }) {
      const where: string[] = [];
      const params: string[] = [];
      if (deviceId) {
        where.push('device_id = ?');
        params.push(deviceId);
      }
      if (siteId) {
        where.push('site_id = ?');
        params.push(siteId);
      }
      const { rows } = await db.execute(
        `SELECT payload FROM diagnostics ${
          where.length ? `WHERE ${where.join(' AND ')}` : ''
        } ORDER BY started_at DESC`,
        params,
      );
      return rows.map(row => parse<Diagnostic>(row));
    },
    findInstallation: id =>
      one<Installation>('SELECT payload FROM installations WHERE id = ?', [id]),
    async listInstallations(siteId) {
      const { rows } = await db.execute(
        `SELECT payload FROM installations ${
          siteId ? 'WHERE site_id = ?' : ''
        } ORDER BY created_at DESC`,
        siteId ? [siteId] : [],
      );
      return rows.map(row => parse<Installation>(row));
    },
    findReport: id =>
      one<InstallationReport>('SELECT payload FROM reports WHERE id = ?', [id]),
    async listReports(installationId) {
      const { rows } = await db.execute(
        `SELECT payload FROM reports ${
          installationId ? 'WHERE installation_id = ?' : ''
        } ORDER BY created_at DESC`,
        installationId ? [installationId] : [],
      );
      return rows.map(row => parse<InstallationReport>(row));
    },
    async saveInstallationWithAction(installation, action) {
      await db.transaction(async tx => {
        await tx.execute(
          `INSERT OR REPLACE INTO installations (id, site_id, revision, created_at, payload)
           VALUES (?, ?, ?, ?, ?)`,
          [
            installation.id,
            installation.siteId,
            installation.revision,
            installation.createdAt,
            JSON.stringify(installation),
          ],
        );
        await enqueue(tx, action);
      });
    },
    async saveDiagnosticWithAction(diagnostic, action) {
      await db.transaction(async tx => {
        await tx.execute(
          `INSERT OR REPLACE INTO diagnostics (id, device_id, site_id, started_at, payload)
           VALUES (?, ?, ?, ?, ?)`,
          [
            diagnostic.id,
            diagnostic.deviceId,
            diagnostic.siteId,
            diagnostic.startedAt,
            JSON.stringify(diagnostic),
          ],
        );
        await enqueue(tx, action);
      });
    },
    async saveReportWithAction(report, action) {
      await db.transaction(async tx => {
        await tx.execute(
          `INSERT OR REPLACE INTO reports (id, installation_id, created_at, payload)
           VALUES (?, ?, ?, ?)`,
          [
            report.id,
            report.installationId,
            report.createdAt,
            JSON.stringify(report),
          ],
        );
        await enqueue(tx, action);
      });
    },
    async listPendingActions() {
      const { rows } = await db.execute(
        "SELECT * FROM outbox WHERE state != 'sent' ORDER BY created_at",
      );
      return rows.map(toAction);
    },
    async getSetting(key) {
      const { rows } = await db.execute(
        'SELECT value FROM settings WHERE key = ?',
        [key],
      );
      return rows[0] ? String(rows[0].value) : null;
    },
    async setSetting(key, value) {
      await db.execute(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value],
      );
    },
    async listReadyActions(now, limit = 20) {
      const { rows } = await db.execute(
        `SELECT * FROM outbox WHERE state = 'pending'
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY created_at LIMIT ?`,
        [now.toISOString(), limit],
      );
      return rows.map(toAction);
    },
    markSending: id =>
      setState(
        id,
        "UPDATE outbox SET state = 'sending', attempts = attempts + 1 WHERE id = ?",
        [],
      ),
    // Lo enviado se borra: la entidad sigue en su tabla y el historial no depende de la cola.
    markSent: id => setState(id, 'DELETE FROM outbox WHERE id = ?', []),
    async markFailed(id, error, now) {
      const { rows } = await db.execute(
        'SELECT attempts FROM outbox WHERE id = ?',
        [id],
      );
      const attempts = Number(rows[0]?.attempts ?? 0);
      await setState(
        id,
        'UPDATE outbox SET state = ?, next_attempt_at = ?, last_error = ? WHERE id = ?',
        [
          shouldGiveUp(attempts) ? 'failed' : 'pending',
          nextAttemptAt(attempts, now),
          error.slice(0, 500),
        ],
      );
    },
    markConflict: (id, error) =>
      setState(
        id,
        "UPDATE outbox SET state = 'conflict', last_error = ? WHERE id = ?",
        [error.slice(0, 500)],
      ),
    markRejected: (id, error) =>
      setState(
        id,
        "UPDATE outbox SET state = 'failed', next_attempt_at = NULL, last_error = ? WHERE id = ?",
        [error.slice(0, 500)],
      ),
    discard: id => setState(id, 'DELETE FROM outbox WHERE id = ?', []),
    async recoverInterrupted() {
      const { rows } = await db.execute(
        "SELECT COUNT(*) AS n FROM outbox WHERE state = 'sending'",
      );
      await db.execute(
        "UPDATE outbox SET state = 'pending' WHERE state = 'sending'",
      );
      return Number(rows[0]?.n ?? 0);
    },
    async retryFailed() {
      const { rows } = await db.execute(
        "SELECT COUNT(*) AS n FROM outbox WHERE state = 'failed'",
      );
      await db.execute(
        "UPDATE outbox SET state = 'pending', attempts = 0, next_attempt_at = NULL WHERE state = 'failed'",
      );
      return Number(rows[0]?.n ?? 0);
    },
  };
}
