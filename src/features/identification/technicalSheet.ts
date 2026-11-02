import type { TechnicalSheet } from '../../core/domain/models';
import { formatDate } from '../../shared/format';
import type { LocalRepository } from '../local-store/contracts';

// Código de equipo impreso en la etiqueta (QR o barras), por ejemplo TP6-ONT-001.
// Se normaliza a mayúsculas; los separadores permitidos son guion, punto y guion bajo.
export function parseEquipmentCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{2,63}$/u.test(code) ? code : null;
}

export type RemoteSheetResult =
  | { kind: 'found'; sheet: TechnicalSheet }
  // El backend respondió que no hay ficha para ese código.
  | { kind: 'not-found' }
  // Sin red, backend caído o respuesta inesperada: no se sabe si existe.
  | { kind: 'unreachable'; message: string };

export type FetchSheet = (code: string) => Promise<RemoteSheetResult>;

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createSheetFetcher(
  baseUrl: string,
  {
    fetchImpl = fetch,
    timeoutMs = 8000,
    now = () => new Date(),
  }: { fetchImpl?: typeof fetch; timeoutMs?: number; now?: () => Date } = {},
): FetchSheet {
  return async code => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(
        `${baseUrl}/technical-sheets/${encodeURIComponent(code)}`,
        { signal: controller.signal },
      );
      if (response.status === 404) return { kind: 'not-found' };
      if (response.status !== 200) {
        return { kind: 'unreachable', message: `El backend respondió HTTP ${response.status}.` };
      }
      const data = await response.json();
      if (
        data?.code !== code ||
        !isText(data.vendor) ||
        !isText(data.model) ||
        !isText(data.instructions)
      ) {
        return { kind: 'unreachable', message: 'El backend envió una ficha inválida.' };
      }
      return {
        kind: 'found',
        sheet: {
          code,
          vendor: data.vendor,
          model: data.model,
          instructions: data.instructions,
          fetchedAt: now().toISOString(),
        },
      };
    } catch {
      return { kind: 'unreachable', message: 'No se pudo contactar al backend.' };
    } finally {
      clearTimeout(timer);
    }
  };
}

export type SheetLookup =
  // Consultando al backend; si hay copia local ya se muestra.
  | { status: 'loading'; code: string; cached?: TechnicalSheet }
  | { status: 'found'; code: string; sheet: TechnicalSheet }
  // Se muestra la copia local porque el backend no respondió o ya no tiene la ficha.
  | { status: 'cached'; code: string; sheet: TechnicalSheet; reason: 'unreachable' | 'not-found' }
  | { status: 'not-found'; code: string }
  // Sin backend y la ficha nunca se descargó en este teléfono.
  | { status: 'unavailable'; code: string; message: string };

export interface LookupView {
  sheet?: TechnicalSheet;
  note: string;
  tone: 'info' | 'ok' | 'warning' | 'error';
}

export function describeLookup(lookup: SheetLookup): LookupView {
  switch (lookup.status) {
    case 'loading':
      return lookup.cached
        ? {
            sheet: lookup.cached,
            note: `Copia guardada el ${formatDate(lookup.cached.fetchedAt)}. Consultando el backend…`,
            tone: 'info',
          }
        : { note: `Buscando la ficha de ${lookup.code}…`, tone: 'info' };
    case 'found':
      return {
        sheet: lookup.sheet,
        note: 'Ficha actualizada desde el backend. Queda guardada para consultarla sin conexión.',
        tone: 'ok',
      };
    case 'cached':
      return {
        sheet: lookup.sheet,
        note:
          lookup.reason === 'not-found'
            ? `El backend ya no tiene ficha para este código. Se muestra la copia guardada el ${formatDate(lookup.sheet.fetchedAt)}.`
            : `Sin conexión con el backend. Se muestra la copia guardada el ${formatDate(lookup.sheet.fetchedAt)}.`,
        tone: 'warning',
      };
    case 'not-found':
      return { note: `No hay ficha técnica para el código ${lookup.code}.`, tone: 'error' };
    case 'unavailable':
      return {
        note: `${lookup.message} La ficha de ${lookup.code} nunca se descargó en este teléfono; reintente con conexión.`,
        tone: 'error',
      };
  }
}

// Muestra primero la copia local (sirve sin red) y después la versión del
// backend, que reemplaza la copia guardada.
export async function lookupSheet(
  code: string,
  deps: {
    repository: Pick<LocalRepository, 'findTechnicalSheet' | 'saveTechnicalSheet'>;
    fetchSheet: FetchSheet;
  },
  onUpdate: (lookup: SheetLookup) => void = () => {},
): Promise<SheetLookup> {
  const cached = (await deps.repository.findTechnicalSheet(code)) ?? undefined;
  onUpdate({ status: 'loading', code, cached });
  const remote = await deps.fetchSheet(code);
  let result: SheetLookup;
  if (remote.kind === 'found') {
    await deps.repository.saveTechnicalSheet(remote.sheet);
    result = { status: 'found', code, sheet: remote.sheet };
  } else if (cached) {
    result = { status: 'cached', code, sheet: cached, reason: remote.kind };
  } else if (remote.kind === 'not-found') {
    result = { status: 'not-found', code };
  } else {
    result = { status: 'unavailable', code, message: remote.message };
  }
  onUpdate(result);
  return result;
}
