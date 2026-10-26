import type { Coordinates, PhotoEvidence } from '../../core/domain/models';

export interface EvidenceService {
  capturePhoto(): Promise<PhotoEvidence>;
  getCoordinates(): Promise<Coordinates>;
}
