import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/routes';
import { LOCAL_SITE_ID } from '../../core/domain/models';
import { createOutboxAction } from '../../core/sync/outboxAction';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';
import type { LocalRepository } from '../local-store/contracts';
import { useRepository } from '../local-store/useRepository';
import {
  SshError,
  type DiagnosticCommand,
  type SshDiagnostic,
  type SshProfile,
  type SshService,
} from './contracts';
import {
  SSH_PROFILES,
  credentialReference,
  formatDuration,
} from './sshDiagnostic';

type Props = NativeStackScreenProps<RootStackParamList, 'SshDiagnostics'> & {
  // Se inyectan en pruebas; en la app se usan el módulo nativo y la base SQLite.
  ssh?: SshService;
  repository?: LocalRepository;
};

const COMMANDS: { id: DiagnosticCommand; label: string }[] = [
  { id: 'uptime', label: 'Uptime' },
  { id: 'interfaces', label: 'Interfaces' },
];

function loadSsh() {
  return import('../../infrastructure/protocols/androidSsh').then(
    module => module.androidSsh,
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'La conexión SSH falló.';
}

export function SshScreen({ route, ssh: injected, repository }: Props) {
  const selected = route.params;
  const getRepository = useRepository(repository);
  const [ssh, setSsh] = useState(injected);
  const [ip, setIp] = useState(selected?.ip || '10.0.2.2');
  const [port, setPort] = useState(selected?.ip ? '22' : '2222');
  const [profile, setProfile] = useState<SshProfile>('linux');
  const [timeout, setTimeoutValue] = useState('8000');
  const [savedUser, setSavedUser] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SshError | Error>();
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<{ command: DiagnosticCommand; fingerprint: string }>();
  const [result, setResult] = useState<SshDiagnostic>();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!ssh) loadSsh().then(setSsh, setError);
    return () => {
      mounted.current = false;
    };
  }, [ssh]);

  const portNumber = Number(port);
  const target = { ip: ip.trim(), port: portNumber };
  const reference = credentialReference(target.ip, target.port);

  const refreshCredential = useCallback(async () => {
    if (!ssh || !/^\d+$/u.test(port)) return;
    setSavedUser(await ssh.credentialUser(reference).catch(() => null));
  }, [ssh, reference, port]);
  useEffect(() => {
    refreshCredential();
  }, [refreshCredential]);

  async function guarded(work: (service: SshService) => Promise<void>) {
    if (!ssh || busy) return;
    setBusy(true);
    setError(undefined);
    setStatus('');
    try {
      await work(ssh);
    } catch (failure) {
      if (mounted.current) setError(failure as Error);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  // La contraseña se envía una vez al Keystore y se borra del formulario.
  const saveCredential = () =>
    guarded(async service => {
      await service.saveCredential(reference, username.trim(), password);
      setPassword('');
      setStatus('Credencial cifrada en el Keystore del teléfono.');
      await refreshCredential();
    });

  const deleteCredential = () =>
    guarded(async service => {
      await service.deleteCredential(reference);
      setStatus('Credencial borrada del teléfono.');
      await refreshCredential();
    });

  async function execute(service: SshService, command: DiagnosticCommand) {
    setResult(undefined);
    setPending(undefined);
    const device = {
      id: selected?.deviceId || `manual:${target.ip}`,
      siteId: selected?.siteId || LOCAL_SITE_ID,
      ip: target.ip,
      discoveryMethod: 'manual' as const,
      discoveredAt: new Date().toISOString(),
    };
    try {
      const diagnostic = await service.runDiagnostic(device, command, {
        profile,
        port: target.port,
        credentialReference: reference,
        timeoutMs: Number(timeout),
      });
      if (mounted.current) setResult(diagnostic);
      if (diagnostic.status === 'success') await save(diagnostic);
    } catch (failure) {
      // Primera conexión: se muestra la huella para que el técnico la confirme.
      if (failure instanceof SshError && failure.code === 'host-key-unknown') {
        const fingerprint = await service.scanHostKey(target.ip, target.port, Number(timeout));
        if (mounted.current) setPending({ command, fingerprint });
        return;
      }
      throw failure;
    }
  }

  async function save(diagnostic: SshDiagnostic) {
    let text = 'Guardado en el dispositivo. Queda en cola para sincronizar.';
    try {
      const repo = await getRepository();
      await repo.saveDiagnosticWithAction(
        diagnostic,
        createOutboxAction('diagnostic.upsert', diagnostic.id, 1, new Date()),
      );
    } catch {
      text = 'No se pudo guardar el resultado en el dispositivo.';
    }
    if (mounted.current) setStatus(text);
  }

  const run = (command: DiagnosticCommand) =>
    guarded(service => execute(service, command));

  const trustAndRun = () =>
    guarded(async service => {
      if (!pending) return;
      await service.trustHostKey(target.ip, target.port, pending.fingerprint);
      await execute(service, pending.command);
    });

  const forgetHostKey = () =>
    guarded(async service => {
      await service.forgetHostKey(target.ip, target.port);
      setStatus('Huella olvidada. La próxima conexión pedirá confirmarla otra vez.');
    });

  const validTarget = /^\d+$/u.test(port) && /^\d+$/u.test(timeout) && !!target.ip;
  const ready = !!ssh && !busy && validTarget;
  const errorCode = error instanceof SshError ? error.code : undefined;

  return (
    <Screen>
      <Text style={styles.tag}>RF-03 · SSH CON COMANDOS PREDEFINIDOS</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Diagnóstico SSH
      </Text>
      {selected?.deviceId && (
        <Text style={styles.body}>Equipo seleccionado: {selected.deviceId}</Text>
      )}
      <Text style={styles.body}>
        Solo se ejecutan comandos de lectura definidos en la app. La identidad
        del equipo se verifica antes de enviar la contraseña.
      </Text>

      <Field label="Dirección IPv4" value={ip} onChange={setIp} editable={!busy} />
      <Field label="Puerto SSH" value={port} onChange={setPort} editable={!busy} />
      <Field
        label="Timeout en milisegundos"
        value={timeout}
        onChange={setTimeoutValue}
        editable={!busy}
      />

      <Text style={styles.label}>Sistema del equipo</Text>
      <View style={styles.row}>
        {SSH_PROFILES.map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityLabel={`Perfil ${item.label}`}
            accessibilityState={{ selected: profile === item.id }}
            onPress={() => setProfile(item.id)}
            style={[styles.chip, profile === item.id && styles.chipSelected]}
          >
            <Text style={profile === item.id ? styles.chipTextSelected : styles.chipText}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {!SSH_PROFILES.find(item => item.id === profile)?.tested && (
        <Text style={styles.body}>
          Perfil sin probar con un equipo real: la salida se muestra sin
          interpretar.
        </Text>
      )}

      <View style={styles.card}>
        <Text style={styles.subtitle}>Credencial</Text>
        {savedUser ? (
          <>
            <Text style={styles.body}>
              Guardada para el usuario {savedUser} ({reference}), cifrada con
              el Keystore de Android.
            </Text>
            <Button label="Borrar credencial" onPress={deleteCredential} disabled={!ready} />
          </>
        ) : (
          <>
            <Field label="Usuario" value={username} onChange={setUsername} editable={!busy} />
            <Field
              label="Contraseña"
              value={password}
              onChange={setPassword}
              editable={!busy}
              secure
            />
            <Button
              label="Guardar en el Keystore"
              onPress={saveCredential}
              disabled={!ready || !username.trim() || !password}
            />
          </>
        )}
      </View>

      <View style={styles.row}>
        {COMMANDS.map(command => (
          <Button
            key={command.id}
            label={`Ejecutar ${command.label.toLowerCase()}`}
            onPress={() => run(command.id)}
            disabled={!ready || !savedUser}
          />
        ))}
      </View>
      {busy && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar conexión"
          onPress={() => ssh?.cancel()}
          style={styles.card}
        >
          <Text style={styles.subtitle}>Cancelar conexión</Text>
        </Pressable>
      )}

      {pending && (
        <View style={styles.warning}>
          <Text style={styles.subtitle}>Confirmar identidad del equipo</Text>
          <Text style={styles.body}>
            Primera conexión con {target.ip}:{target.port}. Compare esta huella
            con la del equipo (el laboratorio la muestra al iniciar):
          </Text>
          <Text selectable style={styles.mono}>
            {pending.fingerprint}
          </Text>
          <View style={styles.row}>
            <Button label="Confiar y ejecutar" onPress={trustAndRun} disabled={busy} />
            <Button label="No confiar" onPress={() => setPending(undefined)} disabled={busy} />
          </View>
        </View>
      )}

      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {message(error)}
        </Text>
      )}
      {errorCode === 'host-key-changed' && (
        <Button label="Olvidar huella guardada" onPress={forgetHostKey} disabled={!ready} />
      )}
      {!!status && <Text style={styles.ok}>{status}</Text>}

      {result && (
        <View accessibilityLiveRegion="polite" style={styles.card}>
          <Text style={styles.subtitle}>Resultado de {result.ssh.commandLine}</Text>
          <Text style={styles.body}>
            Código de salida: {result.ssh.exitStatus}
            {result.ssh.outputTruncated ? ' · salida recortada' : ''}
          </Text>
          {result.ssh.uptimeSeconds !== undefined && (
            <Text style={styles.body}>
              Encendido hace {formatDuration(result.ssh.uptimeSeconds)}
            </Text>
          )}
          {result.ssh.interfaces?.map(item => (
            <Text key={item.name} style={styles.body}>
              {item.name} · {item.state}
              {item.addresses.length ? ` · ${item.addresses.join(', ')}` : ''}
            </Text>
          ))}
          <Text selectable style={styles.mono}>
            {result.ssh.output || '(sin salida)'}
          </Text>
          <Text style={styles.body}>Huella verificada: {result.ssh.hostKeyFingerprint}</Text>
        </View>
      )}
    </Screen>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  secure?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChange}
        editable={props.editable}
        secureTextEntry={props.secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
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
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.accent },
  label: { color: colors.text, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  mono: { fontFamily: 'monospace', fontSize: 13, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  warning: {
    backgroundColor: '#FFF4E5',
    borderColor: '#E0A040',
    borderWidth: 1,
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
  button: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexGrow: 1,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  error: { color: '#9C2424', fontSize: 16 },
  ok: { color: colors.accent, fontSize: 16 },
});
