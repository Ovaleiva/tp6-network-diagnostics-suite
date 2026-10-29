jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaView: require('react-native').View,
}));

// Módulos nativos de evidencia: en Jest no hay cámara, GPS ni sistema de archivos.
jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  VisionCamera: { requestCameraPermission: jest.fn(async () => true) },
  useCameraDevice: jest.fn(() => null),
  usePhotoOutput: jest.fn(() => ({ capturePhotoToFile: jest.fn() })),
  useCameraPermission: jest.fn(() => ({
    hasPermission: false,
    requestPermission: jest.fn(),
  })),
}));
