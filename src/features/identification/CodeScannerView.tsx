import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {
  useBarcodeScannerOutput,
  type TargetBarcodeFormat,
} from 'react-native-vision-camera-barcode-scanner';
import { colors } from '../../shared/theme';

// Constante: el hook recrea la salida si cambia el arreglo.
// Code 128 y Code 39 admiten letras, necesarias para códigos como TP6-ONT-001.
const FORMATS: TargetBarcodeFormat[] = ['qr-code', 'code-128', 'code-39', 'data-matrix'];

type Props = {
  // Se llama con cada valor leído; la pantalla decide si es válido.
  onCode: (raw: string) => void;
};

// ML Kit con el modelo incluido en el APK: lee códigos sin conexión.
export function CodeScannerView({ onCode }: Props) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const scanner = useBarcodeScannerOutput({
    barcodeFormats: FORMATS,
    onBarcodeScanned(barcodes) {
      const value = barcodes.find(b => b.rawValue)?.rawValue;
      if (value) onCode(value);
    },
    onError() {
      // Un cuadro que no se pudo analizar no detiene la lectura.
    },
  });

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  if (!hasPermission || !device) {
    return (
      <View style={[styles.frame, styles.center]}>
        <Text style={styles.message}>
          {!hasPermission
            ? 'Se necesita permiso de cámara para leer el código.'
            : 'No hay cámara trasera disponible.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive outputs={[scanner]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  message: { color: colors.surface, fontSize: 16, textAlign: 'center' },
});
