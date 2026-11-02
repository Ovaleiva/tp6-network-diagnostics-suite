import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';
import type { LocalRepository, OutboxStore } from '../local-store/contracts';
import {
  BACKEND_URL_SETTING,
  normalizeBackendUrl,
  releaseBlocksHttp,
} from './httpTransport';
import {
  backendUrlOf,
  type SyncController,
  type SyncState,
} from './syncController';
import { describeRound, queueView, type ActionEntry, type QueueView } from './syncView';

type Services = {
  repository: LocalRepository & OutboxStore;
  controller: SyncController;
};

type Props = {
  // Se inyectan en pruebas; en la app se cargan la base SQLite y el controlador Android.
  services?: Services;
  // Debug permite HTTP hacia cualquier host (Metro lo necesita); release no.
  isDebugBuild?: boolean;
};

const RELEASE_HTTP_HINT =
  'El APK release solo permite HTTP hacia 10.0.2.2 (emulador) o 127.0.0.1 con ' +
  '"adb reverse tcp:3000 tcp:3000"; para otro host use HTTPS.';

async function defaultServices(): Promise<Services> {
  const { getSyncServices } = await import('../../infrastructure/sync/androidSync');
  return getSyncServices();
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function SyncScreen({ services, isDebugBuild = __DEV__ }: Props) {
  const [deps, setDeps] = useState(services);
  const [sync, setSync] = useState<SyncState>();
  // undefined mientras se abre la base.
  const [queue, setQueue] = useState<QueueView>();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!deps) defaultServices().then(setDeps, e => setError(message(e)));
  }, [deps]);

  const refresh = useCallback(async () => {
    if (!deps) return;
    try {
      setQueue(queueView(await deps.repository.listPendingActions()));
    } catch (e) {
      setError(`No se pudo leer la cola: ${message(e)}`);
    }
  }, [deps]);

  useEffect(() => {
    if (!deps) return;
    backendUrlOf(deps.repository).then(setUrl, e => setError(message(e)));
    setSync(deps.controller.getState());
    refresh();
    // Cada ronda que termina (también las automáticas) actualiza la lista.
    return deps.controller.subscribe(next => {
      setSync(next);
      if (!next.running) refresh();
    });
  }, [deps, refresh]);

  async function saveUrl() {
    if (!deps) return;
    setError('');
    setStatus('');
    const normalized = normalizeBackendUrl(url);
    if (!normalized) {
      setError('URL inválida. Use http://host:puerto o https://host, sin ruta.');
      return;
    }
    const blocked = releaseBlocksHttp(normalized);
    if (blocked && !isDebugBuild) {
      setError(RELEASE_HTTP_HINT);
      return;
    }
    try {
      await deps.repository.setSetting(BACKEND_URL_SETTING, normalized);
      setUrl(normalized);
      setStatus(
        blocked
          ? `URL guardada para esta compilación debug. ${RELEASE_HTTP_HINT}`
          : 'URL guardada. Se usa desde la próxima ronda.',
      );
    } catch (e) {
      setError(message(e));
    }
  }

  async function run(action: () => Promise<unknown>, done?: string) {
    setError('');
    setStatus('');
    try {
      await action();
      if (done) setStatus(done);
    } catch (e) {
      setError(message(e));
    }
    await refresh();
  }

  const running = !!sync?.running;

  return (
    <Screen>
      <Text style={styles.tag}>RF-07 · SINCRONIZACIÓN</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Sincronización
      </Text>
      <Text style={styles.body}>
        Los cambios se guardan primero en el teléfono y se envían al backend
        cuando responde. Tener Wi-Fi no alcanza: antes de enviar se consulta al
        backend.
      </Text>

      <Text style={styles.label}>URL del backend</Text>
      <TextInput
        accessibilityLabel="URL del backend"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
      />
      <View style={styles.row}>
        <Button label="Guardar URL" onPress={saveUrl} disabled={!deps} />
        <Button
          label={running ? 'Sincronizando…' : 'Sincronizar ahora'}
          onPress={() => deps && run(() => deps.controller.syncNow('manual'))}
          disabled={!deps || running}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status ? <Text style={styles.ok}>{status}</Text> : null}
      <Text style={styles.body}>
        {running
          ? 'Sincronizando…'
          : sync?.last
          ? describeRound(sync.last)
          : 'Todavía no se sincronizó en esta sesión.'}
      </Text>

      {!queue ? (
        <Text style={styles.body}>Cargando cola…</Text>
      ) : queue.pending.length + queue.conflicts.length + queue.failed.length === 0 ? (
        <Text style={styles.body}>No hay envíos pendientes.</Text>
      ) : (
        <>
          <Section title={`Pendientes (${queue.pending.length})`} entries={queue.pending} />
          <Section
            title={`En conflicto (${queue.conflicts.length})`}
            hint="El backend tiene otra versión. Descartar quita el envío pero no borra los datos del teléfono."
            entries={queue.conflicts}
            renderAction={entry => (
              <Button
                label="Descartar (conserva los datos locales)"
                accessibilityLabel={`Descartar ${entry.title}`}
                onPress={() =>
                  deps && run(() => deps.repository.discard(entry.id), 'Envío descartado.')
                }
                disabled={!deps}
              />
            )}
          />
          <Section
            title={`Fallidas (${queue.failed.length})`}
            hint="No se reintentan solas."
            entries={queue.failed}
          />
          {queue.failed.length > 0 && (
            <Button
              label="Reintentar fallidas"
              onPress={() =>
                deps &&
                run(async () => {
                  await deps.repository.retryFailed();
                  await deps.controller.syncNow('manual');
                })
              }
              disabled={!deps || running}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function Section(props: {
  title: string;
  hint?: string;
  entries: ActionEntry[];
  renderAction?: (entry: ActionEntry) => React.ReactNode;
}) {
  if (props.entries.length === 0) return null;
  return (
    <>
      <Text style={styles.label}>{props.title}</Text>
      {props.hint ? <Text style={styles.body}>{props.hint}</Text> : null}
      {props.entries.map(entry => (
        <View key={entry.id} style={styles.card}>
          <Text style={styles.cardTitle}>{entry.title}</Text>
          {entry.details.map(line => (
            <Text key={line} style={styles.body}>
              {line}
            </Text>
          ))}
          {props.renderAction?.(entry)}
        </View>
      ))}
    </>
  );
}

function Button(props: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: !!props.disabled }}
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
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  label: { color: colors.text, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  error: { color: '#9C2424', fontSize: 16 },
  ok: { color: colors.accent, fontSize: 16 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
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
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 17 },
});
