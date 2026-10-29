import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/routes';
import type { Installation } from '../../core/domain/models';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';
import type { LocalRepository } from '../local-store/contracts';
import type { EvidenceService } from './contracts';
import {
  addPhoto,
  emptyDraft,
  fromInstallation,
  MAX_PHOTOS,
  removePhoto,
  toInstallation,
  validate,
  type InstallationDraft,
} from './installationDraft';

type Props = NativeStackScreenProps<RootStackParamList, 'Installation'> & {
  // Se inyectan en pruebas; en la app se cargan los adaptadores Android.
  services?: { repository: LocalRepository; evidence: EvidenceService };
};

async function defaultServices() {
  const [{ getRepository }, { androidEvidence }] = await Promise.all([
    import('../../infrastructure/storage/opSqlite'),
    import('../../infrastructure/evidence/androidEvidence'),
  ]);
  return { repository: await getRepository(), evidence: androidEvidence };
}

export function InstallationScreen({ navigation, route, services }: Props) {
  const [deps, setDeps] = useState(services);
  const [draft, setDraft] = useState<InstallationDraft>(() =>
    emptyDraft(new Date()),
  );
  const [saved, setSaved] = useState<Installation[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const handledPhoto = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!deps) defaultServices().then(setDeps, e => setError(String(e)));
  }, [deps]);

  const refresh = useCallback(async () => {
    if (deps) setSaved(await deps.repository.listInstallations());
  }, [deps]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const { deviceId, siteId } = route.params ?? {};
    if (deviceId || siteId) {
      setDraft(d => ({
        ...d,
        deviceId: deviceId ?? d.deviceId,
        siteId: siteId ?? d.siteId,
      }));
    }
  }, [route.params?.deviceId, route.params?.siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // La cámara devuelve la ruta temporal; acá se guarda en almacenamiento propio.
  useEffect(() => {
    const path = route.params?.capturedPhotoPath;
    if (!path || !deps || handledPhoto.current === path) return;
    handledPhoto.current = path;
    (async () => {
      try {
        const now = new Date();
        const next = addPhoto(draft, path, now);
        const photo = next.photos[next.photos.length - 1];
        const uri = await deps.evidence.persistPhoto(path, photo.id);
        setDraft(d => ({ ...d, photos: [...d.photos, { ...photo, localUri: uri }] }));
        setStatus(
          photo.coordinates
            ? 'Foto agregada con ubicación.'
            : 'Foto agregada sin ubicación (obtenga GPS antes de la foto para georreferenciarla).',
        );
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [route.params?.capturedPhotoPath, deps]); // eslint-disable-line react-hooks/exhaustive-deps

  async function locate() {
    if (!deps || locating) return;
    setLocating(true);
    setError('');
    try {
      const coordinates = await deps.evidence.getCoordinates();
      setDraft(d => ({ ...d, coordinates }));
      setStatus(`Ubicación obtenida (±${coordinates.accuracyMeters} m).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  async function openCamera() {
    if (!deps) return;
    setError('');
    try {
      await deps.evidence.ensureCameraPermission();
      navigation.navigate('Camera');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deletePhoto(id: string) {
    const photo = draft.photos.find(p => p.id === id);
    setDraft(d => removePhoto(d, id));
    // Solo se borra el archivo si la foto nunca se guardó en una revisión.
    if (photo && deps && draft.revision === 0) {
      await deps.evidence.deletePhoto(photo.localUri).catch(() => undefined);
    }
  }

  async function save() {
    if (!deps) return;
    setError('');
    try {
      const { installation, action } = toInstallation(draft, new Date());
      await deps.repository.saveInstallationWithAction(installation, action);
      setDraft(fromInstallation(installation));
      setStatus(
        `Instalación guardada (revisión ${installation.revision}). Queda en cola para sincronizar.`,
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const problems = validate(draft);

  return (
    <Screen>
      <Text style={styles.tag}>RF-05 · REGISTRO OFFLINE</Text>
      <Text style={styles.label}>Sitio</Text>
      <TextInput
        accessibilityLabel="Sitio"
        style={styles.input}
        value={draft.siteId}
        onChangeText={siteId => setDraft(d => ({ ...d, siteId }))}
        placeholder="ej. torre-norte"
        autoCapitalize="none"
      />
      <Text style={styles.label}>Equipo (opcional)</Text>
      <TextInput
        accessibilityLabel="Equipo"
        style={styles.input}
        value={draft.deviceId}
        onChangeText={deviceId => setDraft(d => ({ ...d, deviceId }))}
        placeholder="ID o IP del equipo"
        autoCapitalize="none"
      />
      <Text style={styles.label}>Notas técnicas</Text>
      <TextInput
        accessibilityLabel="Notas técnicas"
        style={[styles.input, styles.notes]}
        value={draft.notes}
        onChangeText={notes => setDraft(d => ({ ...d, notes }))}
        multiline
        placeholder="Trabajo realizado, mediciones, observaciones"
      />

      <View style={styles.row}>
        <Button
          label={locating ? 'Buscando GPS…' : 'Obtener ubicación'}
          onPress={locate}
          disabled={locating || !deps}
        />
        <Button
          label={`Tomar foto (${draft.photos.length}/${MAX_PHOTOS})`}
          onPress={openCamera}
          disabled={!deps || draft.photos.length >= MAX_PHOTOS}
        />
      </View>
      <Text style={styles.muted}>
        {draft.coordinates
          ? `GPS: ${draft.coordinates.latitude.toFixed(6)}, ${draft.coordinates.longitude.toFixed(6)} (±${draft.coordinates.accuracyMeters} m)`
          : 'Sin ubicación todavía.'}
      </Text>

      <View style={styles.grid}>
        {draft.photos.map(photo => (
          <Pressable
            key={photo.id}
            accessibilityLabel="Quitar foto"
            onLongPress={() => deletePhoto(photo.id)}
          >
            <Image source={{ uri: photo.localUri }} style={styles.thumb} />
            <Text style={styles.badge}>{photo.coordinates ? 'GPS' : 'sin GPS'}</Text>
          </Pressable>
        ))}
      </View>
      {draft.photos.length > 0 && (
        <Text style={styles.muted}>Mantenga presionada una foto para quitarla.</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status ? <Text style={styles.ok}>{status}</Text> : null}

      <Button
        label="Guardar instalación"
        onPress={save}
        disabled={!deps || problems.length > 0}
      />
      {problems.length > 0 && <Text style={styles.muted}>{problems[0]}</Text>}
      <Button label="Nueva instalación" onPress={() => setDraft(emptyDraft(new Date()))} />

      <Text style={styles.label}>Guardadas en el dispositivo</Text>
      {saved.length === 0 ? (
        <Text style={styles.muted}>Todavía no hay instalaciones guardadas.</Text>
      ) : (
        saved.map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            style={styles.card}
            onPress={() => setDraft(fromInstallation(item))}
          >
            <Text style={styles.cardTitle}>
              {item.siteId} · rev. {item.revision}
            </Text>
            <Text style={styles.muted}>
              {new Date(item.createdAt).toLocaleString()} · {item.photos.length} foto(s)
              {item.coordinates ? ' · GPS' : ''}
            </Text>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function Button(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.button, props.disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tag: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  label: { color: colors.text, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
  },
  notes: { minHeight: 100, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 6 },
  badge: { fontSize: 11, color: colors.muted, textAlign: 'center' },
  muted: { color: colors.muted },
  error: { color: '#B00020' },
  ok: { color: colors.accent },
  button: {
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 8,
    flexGrow: 1,
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#FFF', fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  cardTitle: { color: colors.text, fontWeight: '700' },
});
