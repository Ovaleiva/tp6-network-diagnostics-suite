import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';
import { backendUrlOf } from '../sync/syncController';
import { CodeScannerView } from './CodeScannerView';
import type { IdentificationServices } from './contracts';
import {
  createSheetFetcher,
  describeLookup,
  lookupSheet,
  parseEquipmentCode,
  type SheetLookup,
} from './technicalSheet';

type Props = {
  // Se inyectan en pruebas; en la app se abre la base SQLite y se usa HTTP.
  services?: IdentificationServices;
  // Lector de códigos; en pruebas se reemplaza porque Jest no tiene cámara.
  Scanner?: React.ComponentType<{ onCode: (raw: string) => void }>;
};

async function defaultServices(): Promise<IdentificationServices> {
  const { getRepository } = await import('../../infrastructure/storage/opSqlite');
  return {
    repository: await getRepository(),
    fetcherFor: baseUrl => createSheetFetcher(baseUrl),
  };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function IdentificationScreen({ services, Scanner = CodeScannerView }: Props) {
  const [deps, setDeps] = useState(services);
  const [scanning, setScanning] = useState(false);
  const [input, setInput] = useState('');
  const [lookup, setLookup] = useState<SheetLookup>();
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  // El lector informa el mismo código en muchos cuadros seguidos: solo se usa el primero.
  const handled = useRef(false);
  // Evita que una búsqueda vieja pise el resultado de una más nueva.
  const searchId = useRef(0);

  useEffect(() => {
    if (!deps) defaultServices().then(setDeps, e => setError(message(e)));
  }, [deps]);

  const search = useCallback(
    async (code: string) => {
      if (!deps) return;
      const id = ++searchId.current;
      setError('');
      setHint('');
      try {
        const fetchSheet = deps.fetcherFor(await backendUrlOf(deps.repository));
        await lookupSheet(code, { repository: deps.repository, fetchSheet }, next => {
          if (id === searchId.current) setLookup(next);
        });
      } catch (e) {
        if (id === searchId.current) setError(`No se pudo buscar la ficha: ${message(e)}`);
      }
    },
    [deps],
  );

  const onScanned = useCallback(
    (raw: string) => {
      if (handled.current) return;
      const code = parseEquipmentCode(raw);
      if (!code) {
        setHint(`Se leyó "${raw.slice(0, 40)}", que no es un código de equipo.`);
        return;
      }
      handled.current = true;
      setScanning(false);
      setInput(code);
      search(code);
    },
    [search],
  );

  function startScan() {
    handled.current = false;
    setHint('');
    setError('');
    setScanning(true);
  }

  function searchTyped() {
    const code = parseEquipmentCode(input);
    if (!code) {
      setError('Código inválido: use de 3 a 64 letras, números, guion, punto o guion bajo.');
      return;
    }
    setInput(code);
    search(code);
  }

  const view = lookup ? describeLookup(lookup) : undefined;

  return (
    <Screen>
      <Text style={styles.tag}>RF-04 · QR, BARRAS Y FICHA TÉCNICA</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Identificar equipo
      </Text>
      <Text style={styles.body}>
        Lea el QR o el código de barras de la etiqueta del equipo. La ficha
        técnica se descarga del backend y queda guardada para consultarla sin
        conexión.
      </Text>

      {scanning ? (
        <>
          <Scanner onCode={onScanned} />
          {hint ? <Text style={styles.warning}>{hint}</Text> : null}
          <Button label="Cancelar lectura" onPress={() => setScanning(false)} />
        </>
      ) : (
        <Button label="Escanear código" onPress={startScan} disabled={!deps} />
      )}

      <Text style={styles.label}>Código del equipo</Text>
      <TextInput
        accessibilityLabel="Código del equipo"
        value={input}
        onChangeText={setInput}
        onSubmitEditing={searchTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="TP6-ONT-001"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Button label="Buscar ficha" onPress={searchTyped} disabled={!deps || !input.trim()} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {view ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{lookup!.code}</Text>
          {view.sheet ? (
            <>
              <Text style={styles.body}>
                {view.sheet.vendor} · {view.sheet.model}
              </Text>
              <Text selectable style={styles.instructions}>
                {view.sheet.instructions}
              </Text>
            </>
          ) : null}
          <Text style={toneStyle[view.tone]}>{view.note}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function Button(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
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
  instructions: { fontSize: 16, lineHeight: 24, color: colors.text },
  info: { fontSize: 15, color: colors.muted },
  ok: { fontSize: 15, color: colors.accent },
  warning: { fontSize: 15, color: '#8A5A00' },
  error: { fontSize: 16, color: '#9C2424' },
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

const toneStyle = {
  info: styles.info,
  ok: styles.ok,
  warning: styles.warning,
  error: styles.error,
};
