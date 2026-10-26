import type { TechnicalSheet } from '../../core/domain/models';

export interface IdentificationService {
  scanCode(): Promise<string>;
  // null: la ficha no está disponible ni en caché local ni desde el backend.
  findTechnicalSheet(code: string): Promise<TechnicalSheet | null>;
}
