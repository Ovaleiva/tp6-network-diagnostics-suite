// Modelos independientes de React Native, de la base de datos y de los sockets.
export type EntityId = string;
export type IsoDate = string;

// Sitio usado mientras la app no permite elegir uno; agrupa equipos y diagnósticos.
export const LOCAL_SITE_ID: EntityId = 'sitio-local';

export interface Device {
  id: EntityId;
  siteId: EntityId;
  ip: string;
  mac?: string;
  hostname?: string;
  discoveredAt: IsoDate;
  discoveryMethod: 'mdns' | 'tcp-probe' | 'manual';
  services?: { name: string; type: string; port: number }[];
}

export interface Diagnostic {
  id: EntityId;
  deviceId: EntityId;
  siteId: EntityId;
  protocol: 'snmp' | 'ssh';
  startedAt: IsoDate;
  finishedAt: IsoDate;
  status: 'success' | 'error' | 'timeout';
  summary: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: IsoDate;
}

export interface PhotoEvidence {
  id: EntityId;
  localUri: string;
  capturedAt: IsoDate;
  coordinates?: Coordinates;
}

export interface Installation {
  id: EntityId;
  siteId: EntityId;
  deviceId?: EntityId;
  notes: string;
  photos: PhotoEvidence[];
  coordinates?: Coordinates;
  createdAt: IsoDate;
  revision: number;
}

export interface InstallationReport {
  id: EntityId;
  installationId: EntityId;
  // Revisión de la instalación usada para el PDF; el reporte la documenta tal cual era.
  installationRevision: number;
  // Veces que se generó el PDF de esa revisión; es la revisión que se sincroniza.
  // Falta en los reportes guardados antes de agregar el campo.
  generation?: number;
  localPdfUri: string;
  createdAt: IsoDate;
}

// La cola referencia entidades locales; no contiene contraseñas ni claves privadas.
export interface OutboxAction {
  id: EntityId;
  entityId: EntityId;
  entityRevision: number;
  kind: 'installation.upsert' | 'report.upload' | 'diagnostic.upsert';
  state: 'pending' | 'sending' | 'failed' | 'conflict';
  attempts: number;
  createdAt: IsoDate;
  nextAttemptAt?: IsoDate;
  // Motivo del último intento fallido o del conflicto, para mostrarlo al técnico.
  lastError?: string;
}

export interface TechnicalSheet {
  code: string;
  vendor: string;
  model: string;
  instructions: string;
  fetchedAt: IsoDate;
}
