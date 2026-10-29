import { open } from '@op-engineering/op-sqlite';
import { migrate } from './schema';
import type { SqlDatabase, SqlRow, SqlValue } from './sql';
import { createSqliteRepository } from './sqliteRepository';

type OpExecutor = {
  execute(sql: string, params?: SqlValue[]): Promise<{ rows?: unknown[] }>;
};

function wrap(executor: OpExecutor) {
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const result = await executor.execute(sql, params);
      return { rows: (result.rows ?? []) as SqlRow[] };
    },
  };
}

let repository: ReturnType<typeof createSqliteRepository> | null = null;

// Abre la base una sola vez por proceso y aplica migraciones pendientes.
export async function getRepository() {
  if (repository) return repository;
  const raw = open({ name: 'network-diagnostics.db' });
  const db: SqlDatabase = {
    ...wrap(raw),
    transaction: fn =>
      raw.transaction(async (tx: unknown) => fn(wrap(tx as unknown as OpExecutor))),
  };
  await db.execute('PRAGMA foreign_keys = ON');
  await migrate(db);
  repository = createSqliteRepository(db);
  await repository.recoverInterrupted();
  return repository;
}
