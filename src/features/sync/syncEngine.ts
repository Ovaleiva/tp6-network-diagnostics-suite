import type { OutboxAction } from '../../core/domain/models';
import { reportFileId } from '../../core/sync/reportUpload';
import type { LocalRepository, OutboxStore } from '../local-store/contracts';

export type SendOutcome =
  | { kind: 'ok' }
  | { kind: 'conflict'; message: string }
  // Sin red, backend caído o error 5xx: se reintenta más tarde.
  | { kind: 'temporary'; message: string }
  // El backend rechazó los datos: reintentar igual no sirve.
  | { kind: 'permanent'; message: string };

export interface ActionPayload {
  actionId: string;
  kind: OutboxAction['kind'];
  entityId: string;
  revision: number;
  entity: { id: string } & Record<string, unknown>;
}

export interface FilePayload {
  fileId: string;
  contentType: 'image/jpeg' | 'application/pdf';
  sha256: string;
  dataBase64: string;
}

export interface SyncTransport {
  // true solo si el backend respondió: tener Wi-Fi no alcanza.
  health(): Promise<boolean>;
  sendAction(payload: ActionPayload): Promise<SendOutcome>;
  uploadFile(payload: FilePayload): Promise<SendOutcome>;
}

export interface LocalFileReader {
  // null si el archivo ya no está en el teléfono.
  read(localUri: string): Promise<{ dataBase64: string; sha256: string } | null>;
}

export interface SyncDeps {
  repository: Pick<LocalRepository, 'findInstallation' | 'findReport' | 'findDiagnostic'>;
  outbox: Pick<
    OutboxStore,
    'listReadyActions' | 'markSending' | 'markSent' | 'markFailed' | 'markConflict' | 'markRejected'
  >;
  transport: SyncTransport;
  files: LocalFileReader;
  now: () => Date;
}

export interface SyncSummary {
  reachable: boolean;
  sent: number;
  conflicts: number;
  // Fallos temporales: la acción vuelve a intentarse con espera creciente.
  retrying: number;
  rejected: number;
  // true si la ronda se cortó por un fallo temporal (probablemente se perdió la red).
  interrupted: boolean;
}

interface FileRef {
  fileId: string;
  contentType: FilePayload['contentType'];
  localUri: string;
}

export interface PreparedAction {
  payload: ActionPayload;
  files: FileRef[];
}

class PermanentError extends Error {}

// Arma lo que se envía: la entidad tal como está guardada, sin rutas locales.
// Los archivos viajan aparte y la entidad los referencia por fileId.
export async function prepareAction(
  action: OutboxAction,
  repository: SyncDeps['repository'],
): Promise<PreparedAction> {
  const base = {
    actionId: action.id,
    kind: action.kind,
    entityId: action.entityId,
    revision: action.entityRevision,
  };
  if (action.kind === 'diagnostic.upsert') {
    const diagnostic = await repository.findDiagnostic(action.entityId);
    if (!diagnostic) throw new PermanentError('El diagnóstico ya no existe en el teléfono.');
    return { payload: { ...base, entity: { ...diagnostic } }, files: [] };
  }
  if (action.kind === 'installation.upsert') {
    const installation = await repository.findInstallation(action.entityId);
    if (!installation) throw new PermanentError('La instalación ya no existe en el teléfono.');
    const photos = installation.photos.map(({ localUri: _localUri, ...photo }) => ({
      ...photo,
      fileId: photo.id,
    }));
    return {
      payload: { ...base, entity: { ...installation, photos } },
      files: installation.photos.map(photo => ({
        fileId: photo.id,
        contentType: 'image/jpeg',
        localUri: photo.localUri,
      })),
    };
  }
  const report = await repository.findReport(action.entityId);
  if (!report) throw new PermanentError('El reporte ya no existe en el teléfono.');
  const { localPdfUri, ...rest } = report;
  const fileId = reportFileId(report);
  return {
    payload: { ...base, entity: { ...rest, fileId } },
    files: [{ fileId, contentType: 'application/pdf', localUri: localPdfUri }],
  };
}

async function send(action: OutboxAction, deps: SyncDeps): Promise<SendOutcome> {
  let prepared: PreparedAction;
  try {
    prepared = await prepareAction(action, deps.repository);
  } catch (error) {
    if (error instanceof PermanentError) return { kind: 'permanent', message: error.message };
    throw error;
  }
  for (const file of prepared.files) {
    const content = await deps.files.read(file.localUri);
    if (!content) {
      return { kind: 'permanent', message: `Falta el archivo local ${file.fileId}.` };
    }
    const uploaded = await deps.transport.uploadFile({
      fileId: file.fileId,
      contentType: file.contentType,
      ...content,
    });
    if (uploaded.kind !== 'ok') return uploaded;
  }
  return deps.transport.sendAction(prepared.payload);
}

// Envía las acciones listas en orden de creación. Cada acción se marca
// 'sending' antes de enviarla: si la app se cierra a mitad, al reabrir vuelve
// a 'pending' y se reenvía con el mismo id (el backend no la duplica).
export async function runSync(deps: SyncDeps, limit = 50): Promise<SyncSummary> {
  const summary: SyncSummary = {
    reachable: false,
    sent: 0,
    conflicts: 0,
    retrying: 0,
    rejected: 0,
    interrupted: false,
  };
  summary.reachable = await deps.transport.health().catch(() => false);
  if (!summary.reachable) return summary;

  for (const action of await deps.outbox.listReadyActions(deps.now(), limit)) {
    await deps.outbox.markSending(action.id);
    let outcome: SendOutcome;
    try {
      outcome = await send(action, deps);
    } catch (error) {
      outcome = {
        kind: 'temporary',
        message: error instanceof Error ? error.message : 'Error inesperado al enviar.',
      };
    }
    if (outcome.kind === 'ok') {
      await deps.outbox.markSent(action.id);
      summary.sent++;
    } else if (outcome.kind === 'conflict') {
      await deps.outbox.markConflict(action.id, outcome.message);
      summary.conflicts++;
    } else if (outcome.kind === 'permanent') {
      await deps.outbox.markRejected(action.id, outcome.message);
      summary.rejected++;
    } else {
      // Un fallo temporal suele significar que se perdió el backend: se corta la
      // ronda para no gastar intentos de las demás acciones.
      await deps.outbox.markFailed(action.id, outcome.message, deps.now());
      summary.retrying++;
      summary.interrupted = true;
      break;
    }
  }
  return summary;
}

export function describeSummary(summary: SyncSummary): string {
  if (!summary.reachable) {
    return 'Backend no disponible: los cambios siguen guardados en el teléfono.';
  }
  const parts = [`${summary.sent} enviada(s)`];
  if (summary.conflicts) parts.push(`${summary.conflicts} en conflicto`);
  if (summary.rejected) parts.push(`${summary.rejected} rechazada(s)`);
  if (summary.retrying) parts.push(`${summary.retrying} para reintentar`);
  return `${parts.join(', ')}${summary.interrupted ? '. Se interrumpió por un fallo temporal.' : '.'}`;
}
