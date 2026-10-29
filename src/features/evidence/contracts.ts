import type { Coordinates } from '../../core/domain/models';

export type EvidenceErrorCode =
  | 'permission-denied'
  | 'unavailable'
  | 'timeout'
  | 'cancelled';

export class EvidenceError extends Error {
  constructor(readonly code: EvidenceErrorCode, message: string) {
    super(message);
  }
}

export interface EvidenceService {
  ensureCameraPermission(): Promise<void>;
  getCoordinates(timeoutMs?: number): Promise<Coordinates>;
  // Mueve la foto del caché a almacenamiento propio de la app y devuelve su URI.
  persistPhoto(tempPath: string, photoId: string): Promise<string>;
  deletePhoto(localUri: string): Promise<void>;
}
