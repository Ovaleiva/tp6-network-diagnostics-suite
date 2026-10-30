import type {
  SqlDatabase,
  SqlExecutor,
  SqlValue,
} from '../src/infrastructure/storage/sql';

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

export const hasSqlite = sqlite !== null;

export function memoryDb(): SqlDatabase {
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
