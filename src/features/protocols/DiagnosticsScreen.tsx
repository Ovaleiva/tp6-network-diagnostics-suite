import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/routes';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';
import { androidSnmp } from '../../infrastructure/protocols/androidSnmp';
import { LOCAL_SITE_ID } from '../../core/domain/models';
import { createOutboxAction } from '../../core/sync/outboxAction';
import type { LocalRepository } from '../local-store/contracts';
import { useRepository } from '../local-store/useRepository';
import type { SnmpDiagnostic } from './contracts';

type Props = NativeStackScreenProps<RootStackParamList, 'Diagnostics'> & {
  // Se inyecta en pruebas; en la app se abre la base SQLite.
  repository?: LocalRepository;
};

export function DiagnosticsScreen({
  navigation,
  route,
  repository: injected,
}: Props) {
  const selected = route.params;
  const getRepository = useRepository(injected);
  const [saveStatus, setSaveStatus] = useState('');
  const [ip, setIp] = useState(selected?.ip || '10.0.2.2');
  const [port, setPort] = useState(selected?.ip ? '161' : '1161');
  const [community, setCommunity] = useState(selected?.ip ? '' : 'public');
  const [interfaceIndex, setInterfaceIndex] = useState('1');
  const [timeout, setTimeoutValue] = useState('3000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SnmpDiagnostic['snmp']>();
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (running.current) androidSnmp.cancel();
    };
  }, []);

  async function query() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setResult(undefined);
    setSaveStatus('');
    try {
      if (
        ![port, interfaceIndex, timeout].every(value => /^\d+$/.test(value))
      ) {
        throw new Error(
          'Puerto, índice y plazo deben ser números enteros positivos.',
        );
      }
      const diagnostic = await androidSnmp.readBasicStatus(
        {
          id: selected?.deviceId || `manual:${ip.trim()}`,
          siteId: selected?.siteId || LOCAL_SITE_ID,
          ip: ip.trim(),
          discoveryMethod: 'manual',
          discoveredAt: new Date().toISOString(),
        },
        {
          port: Number(port),
          community,
          interfaceIndex: Number(interfaceIndex),
          timeoutMs: Number(timeout),
        },
      );
      if (mounted.current) setResult(diagnostic.snmp);
      await save(diagnostic);
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'La consulta SNMP falló.',
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  // Solo se guardan consultas exitosas; la comunidad no forma parte del diagnóstico.
  async function save(diagnostic: SnmpDiagnostic) {
    let message = 'Guardado en el dispositivo. Queda en cola para sincronizar.';
    try {
      const repository = await getRepository();
      await repository.saveDiagnosticWithAction(
        diagnostic,
        createOutboxAction('diagnostic.upsert', diagnostic.id, 1, new Date()),
      );
    } catch {
      message = 'No se pudo guardar el resultado en el dispositivo.';
    }
    if (mounted.current) setSaveStatus(message);
  }

  const fields = [
    { label: 'Dirección IPv4', value: ip, change: setIp },
    { label: 'Puerto UDP', value: port, change: setPort },
    { label: 'Comunidad SNMP', value: community, change: setCommunity },
    {
      label: 'Índice de interfaz',
      value: interfaceIndex,
      change: setInterfaceIndex,
    },
    {
      label: 'Timeout en milisegundos',
      value: timeout,
      change: setTimeoutValue,
    },
  ];
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Diagnóstico SNMP
      </Text>
      {selected?.deviceId && (
        <Text style={styles.body}>
          Equipo seleccionado: {selected.deviceId}
        </Text>
      )}
      <View style={styles.card}>
        <Text style={styles.subtitle}>
          {ip.trim() === '10.0.2.2' && port === '1161'
            ? 'Laboratorio local'
            : 'Equipo objetivo'}
        </Text>
        <Text style={styles.body}>
          SNMPv2c · Solo lectura. El laboratorio de PC devuelve contadores
          controlados de su interfaz virtual 1, no tráfico de la placa de red.
        </Text>
      </View>
      {fields.map(field => (
        <View key={field.label}>
          <Text style={styles.body}>{field.label}</Text>
          <TextInput
            accessibilityLabel={field.label}
            value={field.value}
            onChangeText={field.change}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={field.label === 'Comunidad SNMP'}
            style={styles.input}
          />
        </View>
      ))}
      <Text style={styles.body}>
        La comunidad se conserva solo en memoria. SNMPv2c la transmite sin
        cifrar.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Consultar SNMP"
        disabled={busy}
        onPress={query}
        style={[styles.button, busy && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {busy ? 'Consultando…' : 'Consultar SNMP'}
        </Text>
      </Pressable>
      {busy && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar consulta"
          onPress={() => androidSnmp.cancel()}
          style={styles.card}
        >
          <Text style={styles.subtitle}>Cancelar consulta</Text>
        </Pressable>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {result && (
        <View accessibilityLiveRegion="polite" style={styles.card}>
          <Text style={styles.subtitle}>Resultado recibido</Text>
          <Text selectable style={styles.body}>
            sysName: {result.sysName}
          </Text>
          <Text style={styles.body}>
            Uptime del agente: {(result.uptimeTicks / 100).toFixed(2)} s
          </Text>
          <Text style={styles.body}>Interfaz: {result.interfaceIndex}</Text>
          <Text style={styles.body}>
            Entrada: {result.inOctets} octetos acumulados
          </Text>
          <Text style={styles.body}>
            Salida: {result.outOctets} octetos acumulados
          </Text>
          <Text style={styles.body}>
            Contadores Counter32; no representan una tasa de transferencia.
          </Text>
          {!!saveStatus && <Text style={styles.body}>{saveStatus}</Text>}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir diagnóstico SSH"
        disabled={busy}
        onPress={() =>
          navigation.navigate('SshDiagnostics', {
            deviceId: selected?.deviceId,
            ip: selected?.ip,
            siteId: selected?.siteId,
          })
        }
        style={[styles.card, busy && styles.disabled]}
      >
        <Text style={styles.subtitle}>Diagnóstico SSH</Text>
        <Text style={styles.body}>
          Uptime e interfaces con comandos predefinidos y credencial en el
          Keystore.
        </Text>
      </Pressable>
      <Text style={styles.body}>
        RF-02 en validación de laboratorio. Las consultas guardadas se ven en
        Historial.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.accent },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
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
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  error: { color: '#9C2424', fontSize: 16 },
});
