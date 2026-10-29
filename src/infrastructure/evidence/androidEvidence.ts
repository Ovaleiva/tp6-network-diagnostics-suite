import { PermissionsAndroid } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {
  DocumentDirectoryPath,
  exists,
  mkdir,
  moveFile,
  unlink,
} from '@dr.pogodin/react-native-fs';
import { VisionCamera } from 'react-native-vision-camera';
import {
  EvidenceError,
  type EvidenceService,
} from '../../features/evidence/contracts';

const PHOTO_DIR = `${DocumentDirectoryPath}/evidence`;

async function ensureLocationPermission() {
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new EvidenceError(
      'permission-denied',
      'Sin permiso de ubicación. Puede guardar la instalación sin GPS.',
    );
  }
}

export const androidEvidence: EvidenceService = {
  async ensureCameraPermission() {
    const granted = await VisionCamera.requestCameraPermission();
    if (!granted) {
      throw new EvidenceError(
        'permission-denied',
        'Sin permiso de cámara. Habilítelo en Ajustes > Apps.',
      );
    }
  },

  async getCoordinates(timeoutMs = 20_000) {
    await ensureLocationPermission();
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: Math.round(position.coords.accuracy),
            capturedAt: new Date(position.timestamp).toISOString(),
          }),
        error => {
          const code =
            error.code === 1
              ? 'permission-denied'
              : error.code === 3
              ? 'timeout'
              : 'unavailable';
          reject(
            new EvidenceError(
              code,
              code === 'timeout'
                ? 'El GPS no obtuvo señal a tiempo. Intente a cielo abierto.'
                : 'No se pudo obtener la ubicación.',
            ),
          );
        },
        // GPS satelital: funciona sin datos móviles ni Wi-Fi.
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
      );
    });
  },

  async persistPhoto(tempPath, photoId) {
    if (!(await exists(PHOTO_DIR))) await mkdir(PHOTO_DIR);
    const source = tempPath.replace(/^file:\/\//u, '');
    const target = `${PHOTO_DIR}/${photoId}.jpg`;
    await moveFile(source, target);
    return `file://${target}`;
  },

  async deletePhoto(localUri) {
    const path = localUri.replace(/^file:\/\//u, '');
    if (path.startsWith(PHOTO_DIR) && (await exists(path))) await unlink(path);
  },
};
