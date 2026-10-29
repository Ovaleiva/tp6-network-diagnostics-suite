import { useCallback } from 'react';
import type { LocalRepository } from './contracts';

// Devuelve una función que entrega el repositorio inyectado (pruebas) o la base
// SQLite de la app. Se espera la apertura al momento de usarla, así una pantalla
// no falla por guardar mientras la base todavía se está abriendo.
export function useRepository(injected?: LocalRepository) {
  return useCallback(
    (): Promise<LocalRepository> =>
      injected
        ? Promise.resolve(injected)
        : import('../../infrastructure/storage/opSqlite').then(module =>
            module.getRepository(),
          ),
    [injected],
  );
}
