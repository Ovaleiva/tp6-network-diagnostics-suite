// Cada ruta declara sus parámetros; TypeScript controla las llamadas a navigate.
export type RootStackParamList = {
  Home: undefined;
  Devices: undefined;
  Diagnostics: { deviceId: string } | undefined;
  Identification: undefined;
  Installation: undefined;
  Reports: undefined;
  History: undefined;
  Sync: undefined;
};
