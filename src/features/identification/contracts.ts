import type { LocalRepository } from '../local-store/contracts';
import type { FetchSheet } from './technicalSheet';

export interface IdentificationServices {
  repository: Pick<
    LocalRepository,
    'findTechnicalSheet' | 'saveTechnicalSheet' | 'getSetting'
  >;
  // Recibe la URL del backend guardada en Sincronización.
  fetcherFor: (baseUrl: string) => FetchSheet;
}
