import type { LocalRepository, OutboxStore } from '../local-store/contracts';
import {
  BACKEND_URL_SETTING,
  DEFAULT_BACKEND_URL,
  normalizeBackendUrl,
} from './httpTransport';
import {
  runSync,
  type LocalFileReader,
  type SyncSummary,
  type SyncTransport,
} from './syncEngine';

export type SyncTrigger = 'apertura' | 'red' | 'periodica' | 'manual';

export interface SyncRound {
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt: string;
  summary?: SyncSummary;
  // La ronda no llegó a evaluar la cola (por ejemplo, no se pudo abrir la base).
  error?: string;
}

export interface SyncState {
  running: boolean;
  last?: SyncRound;
}

export interface SyncController {
  getState(): SyncState;
  subscribe(listener: (state: SyncState) => void): () => void;
  // Si ya hay una ronda en curso devuelve esa misma: nunca corren dos a la vez.
  syncNow(trigger?: SyncTrigger): Promise<SyncRound>;
  // Señal de NetInfo. Solo dispara una ronda al pasar de sin red a con red;
  // si el backend responde lo decide /health, no esta señal.
  networkChanged(connected: boolean): void;
  // App en primer plano: sincroniza ya y luego cada intervalo.
  start(): void;
  // App en segundo plano: deja de sincronizar periódicamente.
  stop(): void;
}

export const SYNC_INTERVAL_MS = 60_000;

export function createSyncController({
  round,
  now = () => new Date(),
  intervalMs = SYNC_INTERVAL_MS,
}: {
  round: () => Promise<SyncSummary>;
  now?: () => Date;
  intervalMs?: number;
}): SyncController {
  let state: SyncState = { running: false };
  let current: Promise<SyncRound> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let connected: boolean | null = null;
  const listeners = new Set<(state: SyncState) => void>();

  function publish(next: SyncState) {
    state = next;
    for (const listener of listeners) listener(state);
  }

  async function execute(trigger: SyncTrigger): Promise<SyncRound> {
    const startedAt = now().toISOString();
    let result: Pick<SyncRound, 'summary' | 'error'>;
    try {
      result = { summary: await round() };
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    return { trigger, startedAt, finishedAt: now().toISOString(), ...result };
  }

  function syncNow(trigger: SyncTrigger = 'manual') {
    if (current) return current;
    publish({ ...state, running: true });
    current = execute(trigger).then(last => {
      current = null;
      publish({ running: false, last });
      return last;
    });
    return current;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    syncNow,
    networkChanged(next) {
      const recovered = connected === false && next;
      connected = next;
      if (recovered) syncNow('red');
    },
    start() {
      if (!timer) timer = setInterval(() => syncNow('periodica'), intervalMs);
      syncNow('apertura');
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

export async function backendUrlOf(
  repository: Pick<LocalRepository, 'getSetting'>,
): Promise<string> {
  const saved = await repository.getSetting(BACKEND_URL_SETTING);
  return (saved && normalizeBackendUrl(saved)) || DEFAULT_BACKEND_URL;
}

// Una ronda completa: lee la URL guardada en cada ronda, así un cambio en la
// pantalla se aplica en la siguiente sin reiniciar la app.
export function createSyncRound({
  open,
  files,
  transportFor,
  now = () => new Date(),
}: {
  open: () => Promise<LocalRepository & OutboxStore>;
  files: LocalFileReader;
  transportFor: (baseUrl: string) => SyncTransport;
  now?: () => Date;
}) {
  return async (): Promise<SyncSummary> => {
    const repository = await open();
    const transport = transportFor(await backendUrlOf(repository));
    return runSync({ repository, outbox: repository, transport, files, now });
  };
}
