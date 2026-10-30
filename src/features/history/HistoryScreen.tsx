import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Diagnostic, EntityId } from '../../core/domain/models';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';
import type { LocalRepository } from '../local-store/contracts';
import { useRepository } from '../local-store/useRepository';
import {
  describeDiagnostic,
  deviceLabel,
  devicesIn,
  filterByDevice,
  statusLabel,
} from './historyView';

type Props = {
  // Se inyecta en pruebas; en la app se abre la base SQLite.
  repository?: LocalRepository;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// Lee solo la base local: funciona sin red y después de cerrar la app.
export function HistoryScreen({ repository }: Props) {
  const getRepository = useRepository(repository);
  const [sites, setSites] = useState<EntityId[]>([]);
  const [site, setSite] = useState<EntityId>();
  const [device, setDevice] = useState<EntityId>();
  // undefined mientras se abre la base.
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>();
  const [expanded, setExpanded] = useState<EntityId>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const repo = await getRepository();
      const [allSites, items] = await Promise.all([
        repo.listSites(),
        repo.listDiagnostics(site ? { siteId: site } : {}),
      ]);
      setSites(allSites);
      setDiagnostics(items);
    } catch (e) {
      setError(`No se pudo leer el historial: ${message(e)}`);
    }
  }, [getRepository, site]);
  useEffect(() => {
    load();
  }, [load]);

  function chooseSite(next?: EntityId) {
    setSite(next);
    setDevice(undefined);
    setExpanded(undefined);
  }

  const devices = devicesIn(diagnostics ?? []);
  const visible = filterByDevice(diagnostics ?? [], device);

  return (
    <Screen>
      <Text style={styles.tag}>RF-08 · HISTORIAL SIN CONEXIÓN</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Historial
      </Text>
      <Text style={styles.body}>
        Diagnósticos SNMP y SSH guardados en este teléfono. Se consultan sin
        Internet.
      </Text>

      <Text style={styles.label}>Sitio</Text>
      <View style={styles.row}>
        <Chip label="Todos los sitios" selected={!site} onPress={() => chooseSite()} />
        {sites.map(item => (
          <Chip key={item} label={item} selected={site === item} onPress={() => chooseSite(item)} />
        ))}
      </View>

      {devices.length > 1 && (
        <>
          <Text style={styles.label}>Equipo</Text>
          <View style={styles.row}>
            <Chip label="Todos los equipos" selected={!device} onPress={() => setDevice(undefined)} />
            {devices.map(item => (
              <Chip
                key={item}
                label={deviceLabel(item)}
                selected={device === item}
                onPress={() => setDevice(item)}
              />
            ))}
          </View>
        </>
      )}

      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar historial" onPress={load}>
        <Text style={styles.link}>Actualizar</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!diagnostics ? (
        <Text style={styles.body}>Cargando historial…</Text>
      ) : visible.length === 0 ? (
        <Text style={styles.body}>
          {site || device
            ? 'No hay diagnósticos para este filtro.'
            : 'Todavía no hay diagnósticos guardados. Las consultas SNMP y SSH exitosas aparecen acá.'}
        </Text>
      ) : (
        <>
          <Text style={styles.body}>
            {`${visible.length} diagnóstico(s), del más reciente al más antiguo.`}
          </Text>
          {visible.map(item => {
            const entry = describeDiagnostic(item);
            const open = expanded === entry.id;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={`${entry.title}, ${entry.subtitle}`}
                accessibilityState={{ expanded: open }}
                onPress={() => setExpanded(open ? undefined : entry.id)}
                style={styles.card}
              >
                <Text style={styles.cardTitle}>{entry.title}</Text>
                <Text style={styles.body}>
                  {entry.subtitle} · {statusLabel(entry.status)}
                </Text>
                {open ? (
                  <>
                    {entry.details.map(line => (
                      <Text key={line} selectable style={styles.body}>
                        {line}
                      </Text>
                    ))}
                    {entry.output ? (
                      <Text selectable style={styles.mono}>
                        {entry.output}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.link}>Ver detalle</Text>
                )}
              </Pressable>
            );
          })}
        </>
      )}
    </Screen>
  );
}

function Chip(props: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`Filtrar ${props.label}`}
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={[styles.chip, props.selected && styles.chipSelected]}
    >
      <Text style={props.selected ? styles.chipTextSelected : styles.chipText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tag: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  label: { color: colors.text, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  mono: { fontFamily: 'monospace', fontSize: 13, color: colors.text },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  error: { color: '#9C2424', fontSize: 16 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text },
  chipTextSelected: { color: '#FFFFFF', fontWeight: '700' },
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
