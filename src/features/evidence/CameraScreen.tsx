import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import type { RootStackParamList } from '../../app/navigation/routes';
import { colors } from '../../shared/theme';

export function CameraScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Camera'>) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput({ containerFormat: 'jpeg' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  async function shoot() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const photo = await photoOutput.capturePhotoToFile(
        { flashMode: 'off' },
        {},
      );
      navigation.popTo(
        'Installation',
        { capturedPhotoPath: photo.filePath },
        { merge: true },
      );
    } catch {
      setError('No se pudo tomar la foto. Intente de nuevo.');
      setBusy(false);
    }
  }

  if (!hasPermission || !device) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          {!hasPermission
            ? 'Se necesita permiso de cámara.'
            : 'No hay cámara trasera disponible.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        outputs={[photoOutput]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tomar foto"
        disabled={busy}
        onPress={shoot}
        style={[styles.shutter, busy && styles.disabled]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: { color: colors.text, fontSize: 16, textAlign: 'center' },
  error: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    color: '#FFF',
    backgroundColor: '#B00020',
    padding: 8,
    borderRadius: 6,
  },
  shutter: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 5,
    borderColor: '#FFF',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  disabled: { opacity: 0.4 },
});
