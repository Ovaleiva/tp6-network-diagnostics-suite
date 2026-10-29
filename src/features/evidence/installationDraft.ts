import type {
  Coordinates,
  Installation,
  OutboxAction,
  PhotoEvidence,
} from '../../core/domain/models';
import { newId } from '../../core/ids';
import { createOutboxAction } from '../../core/sync/outboxAction';

export const MAX_PHOTOS = 10;
export const MAX_NOTES = 2000;
// Una ubicación más vieja que esto no se asocia automáticamente a una foto.
export const FIX_MAX_AGE_MS = 5 * 60_000;

export interface InstallationDraft {
  id: string;
  siteId: string;
  deviceId: string;
  notes: string;
  photos: PhotoEvidence[];
  coordinates?: Coordinates;
  createdAt: string;
  revision: number;
}

export function emptyDraft(now: Date): InstallationDraft {
  return {
    id: newId('inst', now.getTime()),
    siteId: '',
    deviceId: '',
    notes: '',
    photos: [],
    createdAt: now.toISOString(),
    revision: 0,
  };
}

export function fromInstallation(item: Installation): InstallationDraft {
  return { ...item, deviceId: item.deviceId ?? '' };
}

export function isFresh(fix: Coordinates | undefined, now: Date) {
  return (
    !!fix && now.getTime() - Date.parse(fix.capturedAt) <= FIX_MAX_AGE_MS
  );
}

export function addPhoto(
  draft: InstallationDraft,
  localUri: string,
  now: Date,
): InstallationDraft {
  if (draft.photos.length >= MAX_PHOTOS) {
    throw new Error(`Se permiten hasta ${MAX_PHOTOS} fotos por instalación.`);
  }
  const photo: PhotoEvidence = {
    id: newId('photo', now.getTime()),
    localUri,
    capturedAt: now.toISOString(),
    ...(isFresh(draft.coordinates, now)
      ? { coordinates: draft.coordinates }
      : {}),
  };
  return { ...draft, photos: [...draft.photos, photo] };
}

export function removePhoto(draft: InstallationDraft, photoId: string) {
  return { ...draft, photos: draft.photos.filter(p => p.id !== photoId) };
}

export function validate(draft: InstallationDraft): string[] {
  const errors: string[] = [];
  if (!/^[\w.-]{1,40}$/u.test(draft.siteId.trim())) {
    errors.push('Ingrese el sitio (letras, números, punto o guion; máx. 40).');
  }
  if (draft.notes.trim().length === 0) {
    errors.push('Agregue al menos una nota técnica.');
  }
  if (draft.notes.length > MAX_NOTES) {
    errors.push(`Las notas superan ${MAX_NOTES} caracteres.`);
  }
  return errors;
}

// Cada guardado sube la revisión: el backend la usa para detectar conflictos.
export function toInstallation(
  draft: InstallationDraft,
  now: Date,
): { installation: Installation; action: OutboxAction } {
  const errors = validate(draft);
  if (errors.length) throw new Error(errors.join('\n'));
  const revision = draft.revision + 1;
  const installation: Installation = {
    id: draft.id,
    siteId: draft.siteId.trim(),
    ...(draft.deviceId.trim() ? { deviceId: draft.deviceId.trim() } : {}),
    notes: draft.notes.trim(),
    photos: draft.photos,
    ...(draft.coordinates ? { coordinates: draft.coordinates } : {}),
    createdAt: draft.createdAt,
    revision,
  };
  return {
    installation,
    action: createOutboxAction(
      'installation.upsert',
      installation.id,
      revision,
      now,
    ),
  };
}
