import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  Installation,
  InstallationReport,
} from '../../core/domain/models';
import { createOutboxAction } from '../../core/sync/outboxAction';
import { nextReportGeneration } from '../../core/sync/reportUpload';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';
import type { LocalRepository } from '../local-store/contracts';
import type { ReportingService } from './contracts';
// Desde shared: importar installationPdf cargaría pdf-lib con la pantalla.
import { formatDate } from '../../shared/format';

type Props = {
  // Se inyectan en pruebas; en la app se cargan la base SQLite y el adaptador Android.
  services?: { repository: LocalRepository; reporting: ReportingService };
};

async function defaultServices() {
  const [{ getRepository }, { androidReporting }] = await Promise.all([
    import('../../infrastructure/storage/opSqlite'),
    import('../../infrastructure/reporting/androidReporting'),
  ]);
  return { repository: await getRepository(), reporting: androidReporting };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ReportsScreen({ services }: Props) {
  const [deps, setDeps] = useState(services);
  // undefined mientras se abre la base; así no se informa "sin instalaciones" antes de tiempo.
  const [installations, setInstallations] = useState<Installation[]>();
  // Último reporte de cada instalación.
  const [reports, setReports] = useState<Record<string, InstallationReport>>({});
  const [busyId, setBusyId] = useState<string>();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!deps) defaultServices().then(setDeps, e => setError(message(e)));
  }, [deps]);

  const refresh = useCallback(async () => {
    if (!deps) return;
    const [saved, generated] = await Promise.all([
      deps.repository.listInstallations(),
      deps.repository.listReports(),
    ]);
    const latest: Record<string, InstallationReport> = {};
    for (const report of generated) {
      latest[report.installationId] ??= report;
    }
    setInstallations(saved);
    setReports(latest);
  }, [deps]);
  useEffect(() => {
    refresh().catch(e => setError(message(e)));
  }, [refresh]);

  // El PDF y su acción de subida se guardan juntos; la subida la hará la sincronización.
  async function generate(installation: Installation) {
    if (!deps || busyId) return;
    setBusyId(installation.id);
    setError('');
    setStatus('');
    try {
      const generated = await deps.reporting.generate(installation);
      const report = {
        ...generated,
        generation: nextReportGeneration(reports[installation.id], installation.revision),
      };
      await deps.repository.saveReportWithAction(
        report,
        createOutboxAction('report.upload', report.id, report.generation, new Date()),
      );
      setStatus('PDF guardado en el dispositivo. Queda en cola para sincronizar.');
      await refresh();
    } catch (e) {
      setError(`No se pudo generar el PDF: ${message(e)}`);
    } finally {
      setBusyId(undefined);
    }
  }

  async function open(report: InstallationReport) {
    if (!deps) return;
    setError('');
    try {
      await deps.reporting.open(report);
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <Screen>
      <Text style={styles.tag}>RF-06 · PDF DE INSTALACIÓN</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Reportes
      </Text>
      <Text style={styles.muted}>
        El PDF se genera en el teléfono con las notas, las coordenadas y las
        fotos de la instalación guardada. No requiere conexión.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status ? <Text style={styles.ok}>{status}</Text> : null}

      {!installations ? (
        <Text style={styles.muted}>Cargando instalaciones…</Text>
      ) : installations.length === 0 ? (
        <Text style={styles.muted}>
          Todavía no hay instalaciones guardadas. Registre una en Instalación.
        </Text>
      ) : (
        installations.map(item => {
          const name = `${item.siteId} rev. ${item.revision}`;
          const report = reports[item.id];
          const current = report?.installationRevision === item.revision;
          return (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{name}</Text>
              <Text style={styles.muted}>
                {formatDate(item.createdAt)} · {item.photos.length} foto(s)
                {item.coordinates ? ' · GPS' : ' · sin GPS'}
              </Text>
              <Text style={styles.muted}>
                {!report
                  ? 'Sin PDF generado.'
                  : current
                  ? `PDF generado el ${formatDate(report.createdAt)}.`
                  : `El PDF es de la revisión ${report.installationRevision}; genere uno nuevo.`}
              </Text>
              <View style={styles.row}>
                <Button
                  label={
                    busyId === item.id
                      ? 'Generando…'
                      : current
                      ? 'Regenerar PDF'
                      : 'Generar PDF'
                  }
                  accessibilityLabel={`Generar PDF ${name}`}
                  onPress={() => generate(item)}
                  disabled={!deps || !!busyId}
                />
                {report && (
                  <Button
                    label="Abrir PDF"
                    accessibilityLabel={`Abrir PDF ${name}`}
                    onPress={() => open(report)}
                    disabled={!deps}
                  />
                )}
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

function Button(props: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
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
  muted: { color: colors.muted },
  error: { color: '#B00020' },
  ok: { color: colors.accent },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
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
    gap: 8,
  },
  cardTitle: { color: colors.text, fontWeight: '700' },
});
