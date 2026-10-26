// Modelos independientes de React Native, de la base de datos y de los sockets.
export type EntityId = string;
export type IsoDate = string;

export interface Device {
  id: EntityId;
  siteId: EntityId;
  ip: string;
  mac?: string;
  hostname?: string;
  discoveredAt: IsoDate;
  discoveryMethod: 'mdns' | 'tcp-probe' | 'manual';
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
}

export interface TechnicalSheet {
  code: string;
  vendor: string;
  model: string;
  instructions: string;
  fetchedAt: IsoDate;
}
