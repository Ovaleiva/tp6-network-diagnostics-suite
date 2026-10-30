import type { SendOutcome, SyncTransport } from './syncEngine';

export const DEFAULT_BACKEND_URL = 'http://10.0.2.2:3000';
export const BACKEND_URL_SETTING = 'backendUrl';

// Solo esquema, host y puerto: http(s)://host[:puerto], sin ruta.
export function normalizeBackendUrl(input: string): string | null {
  const value = input.trim().replace(/\/+$/u, '');
  return /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/u.test(value) ? value : null;
}

// Clasifica la respuesta HTTP según qué hacer con la acción.
export function outcomeFor(status: number, message: string): SendOutcome {
  if (status >= 200 && status < 300) return { kind: 'ok' };
  if (status === 409) return { kind: 'conflict', message };
  if (status === 408 || status === 429 || status >= 500) {
    return { kind: 'temporary', message };
  }
  return { kind: 'permanent', message };
}

type Fetch = typeof fetch;

export function createHttpTransport(
  baseUrl: string,
  { timeoutMs = 15000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: Fetch } = {},
): SyncTransport {
  async function request(path: string, body?: unknown): Promise<{ status: number; message: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let message = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (typeof data?.error === 'string') message = data.error;
      } catch {
        // Respuesta sin JSON: se usa el código HTTP.
      }
      return { status: response.status, message };
    } finally {
      clearTimeout(timer);
    }
  }

  // Sin red o sin respuesta a tiempo: fallo temporal.
  async function post(path: string, body: unknown): Promise<SendOutcome> {
    try {
      const { status, message } = await request(path, body);
      return outcomeFor(status, message);
    } catch {
      return { kind: 'temporary', message: 'No se pudo contactar al backend.' };
    }
  }

  return {
    async health() {
      try {
        return (await request('/health')).status === 200;
      } catch {
        return false;
      }
    },
    sendAction: payload => post('/sync/actions', payload),
    uploadFile: payload => post('/sync/files', payload),
  };
}
