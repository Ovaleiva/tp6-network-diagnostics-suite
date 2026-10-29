// Cada ruta declara sus parámetros; TypeScript controla las llamadas a navigate.
import type { Device } from '../../core/domain/models';

export type RootStackParamList = {
  Home: undefined;
  Devices: undefined;
  DeviceDetails: { device: Device };
  Diagnostics: { deviceId: string; ip?: string } | undefined;
  Identification: undefined;
  Installation: undefined;
  Reports: undefined;
  History: undefined;
  Sync: undefined;
};
