import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { exists, hash, readFile } from '@dr.pogodin/react-native-fs';
import { getRepository } from '../storage/opSqlite';
import { createHttpTransport } from '../../features/sync/httpTransport';
import {
  createSyncController,
  createSyncRound,
  type SyncController,
} from '../../features/sync/syncController';
import type { LocalFileReader } from '../../features/sync/syncEngine';

// Fotos y PDF se envían en base64 con su SHA-256 (hex), que el backend verifica.
export const androidFiles: LocalFileReader = {
  async read(localUri) {
    const path = localUri.replace(/^file:\/\//u, '');
    if (!(await exists(path))) return null;
    const [dataBase64, sha256] = await Promise.all([
      readFile(path, 'base64'),
      hash(path, 'sha256'),
    ]);
    return { dataBase64, sha256 };
  },
};

let controller: SyncController | null = null;

// Un solo controlador por proceso, compartido por App y la pantalla.
export function getSyncController() {
  controller ??= createSyncController({
    round: createSyncRound({
      open: getRepository,
      files: androidFiles,
      transportFor: baseUrl => createHttpTransport(baseUrl),
    }),
  });
  return controller;
}

// La pantalla pide todo a este módulo, el mismo que carga App: en debug, dos
// import() simultáneos de bloques que se solapan dejaron la pantalla esperando.
export async function getSyncServices() {
  return { repository: await getRepository(), controller: getSyncController() };
}

// Sincroniza al abrir la app, al volver la red y cada minuto en primer plano.
// Devuelve la función que lo detiene.
export function startAutoSync(): () => void {
  const sync = getSyncController();
  sync.start();
  const unsubscribeNet = NetInfo.addEventListener(state =>
    sync.networkChanged(state.isConnected === true),
  );
  const appState = AppState.addEventListener('change', next =>
    next === 'active' ? sync.start() : sync.stop(),
  );
  return () => {
    unsubscribeNet();
    appState.remove();
    sync.stop();
  };
}
