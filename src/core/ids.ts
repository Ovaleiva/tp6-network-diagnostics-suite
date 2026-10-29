// Identificadores locales únicos sin depender del backend (offline-first).
export function newId(prefix: string, now = Date.now()): string {
  const random = Math.floor(Math.random() * 2 ** 32).toString(36);
  return `${prefix}-${now.toString(36)}-${random}`;
}
