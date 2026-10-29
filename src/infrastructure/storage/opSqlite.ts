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

let opening: ReturnType<typeof openRepository> | null = null;

// Abre la base una sola vez por proceso y aplica migraciones pendientes.
// Se guarda la promesa para que dos pantallas que piden la base a la vez
// compartan la misma apertura; si falla, el próximo pedido reintenta.
export function getRepository() {
  if (!opening) {
    opening = openRepository();
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

async function openRepository() {
  const raw = open({ name: 'network-diagnostics.db' });
  const db: SqlDatabase = {
    ...wrap(raw),
    transaction: fn =>
      raw.transaction(async (tx: unknown) => fn(wrap(tx as unknown as OpExecutor))),
  };
  await db.execute('PRAGMA foreign_keys = ON');
  await migrate(db);
  const repository = createSqliteRepository(db);
  await repository.recoverInterrupted();
  return repository;
}
