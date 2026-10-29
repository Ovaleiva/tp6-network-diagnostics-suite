// Puerto mínimo sobre SQLite: permite usar op-sqlite en la app y node:sqlite en pruebas.
export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

export interface SqlExecutor {
  execute(sql: string, params?: SqlValue[]): Promise<{ rows: SqlRow[] }>;
}

export interface SqlDatabase extends SqlExecutor {
  // Todas las sentencias dentro de fn se confirman juntas o ninguna.
  transaction(fn: (tx: SqlExecutor) => Promise<void>): Promise<void>;
}
