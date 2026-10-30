import type { SqlDatabase } from './sql';

// Cada migración se aplica una sola vez; el número queda en PRAGMA user_version.
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL, ip TEXT NOT NULL,
      payload TEXT NOT NULL, discovered_at TEXT NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS idx_devices_site ON devices(site_id)',
    `CREATE TABLE IF NOT EXISTS diagnostics (
      id TEXT PRIMARY KEY, device_id TEXT NOT NULL, site_id TEXT NOT NULL,
      started_at TEXT NOT NULL, payload TEXT NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS idx_diag_device ON diagnostics(device_id, started_at)',
    'CREATE INDEX IF NOT EXISTS idx_diag_site ON diagnostics(site_id, started_at)',
    `CREATE TABLE IF NOT EXISTS installations (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL, revision INTEGER NOT NULL,
      created_at TEXT NOT NULL, payload TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, installation_id TEXT NOT NULL,
      created_at TEXT NOT NULL, payload TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, entity_revision INTEGER NOT NULL,
      kind TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL,
      created_at TEXT NOT NULL, next_attempt_at TEXT, last_error TEXT)`,
    'CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox(state, next_attempt_at)',
  ],
  // 2: configuración local (por ejemplo, la URL del backend de sincronización).
  [
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  ],
];

export async function migrate(db: SqlDatabase): Promise<number> {
  const { rows } = await db.execute('PRAGMA user_version');
  const current = Number(rows[0]?.user_version ?? 0);
  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.transaction(async tx => {
      for (const statement of MIGRATIONS[version]) {
        await tx.execute(statement);
      }
      await tx.execute(`PRAGMA user_version = ${version + 1}`);
    });
  }
  return MIGRATIONS.length;
}
