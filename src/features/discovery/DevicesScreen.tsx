import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/routes';
import type { DiscoveryResult, LanInfo } from './contracts';
import { androidDiscovery } from '../../infrastructure/discovery/androidDiscovery';
import { androidTcpProbe } from '../../infrastructure/discovery/androidTcpProbe';
import { LOCAL_SITE_ID } from '../../core/domain/models';
import type { Device } from '../../core/domain/models';
import type { LocalRepository } from '../local-store/contracts';
import { useRepository } from '../local-store/useRepository';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';
import {
  devicesFromProbe,
  parseRange,
  suggestedRange,
  sweep,
} from './rangeScan';
import type { ProbeFn, SweepProgress } from './rangeScan';

type Props = NativeStackScreenProps<RootStackParamList, 'Devices'> & {
  // Se inyectan en pruebas; en la app se abre la base SQLite y la sonda nativa.
  repository?: LocalRepository;
  tcpProbe?: { probe: ProbeFn; cancel(): void };
};

type Running = 'mdns' | 'sweep';

const SWEEP_CONCURRENCY = 32;

export function DevicesScreen({
  navigation,
  repository: injected,
  tcpProbe = androidTcpProbe,
}: Props) {
  const getRepository = useRepository(injected);
  const [network, setNetwork] = useState<LanInfo>();
  const [result, setResult] = useState<DiscoveryResult>();
  const [swept, setSwept] = useState<Device[]>();
  const [busy, setBusy] = useState<Running>();
  const [message, setMessage] = useState('Todavía no se ejecutó una búsqueda.');
  const [range, setRange] = useState<string>();
  const [progress, setProgress] = useState<SweepProgress>();
  const [sweepMessage, setSweepMessage] = useState('');
  const mounted = useRef(true);
  const running = useRef<Running | undefined>(undefined);
  const cancelled = useRef(false);

  useEffect(() => {
    mounted.current = true;
    androidDiscovery.getNetworkInfo().then(
      info => {
        if (mounted.current) {
          setNetwork(info);
        }
      },
      () => {}, // El error detallado se presenta al iniciar la búsqueda.
    );
    return () => {
      mounted.current = false;
      if (running.current === 'mdns') {
        androidDiscovery.cancel();
      } else if (running.current === 'sweep') {
        cancelled.current = true;
        tcpProbe.cancel();
      }
    };
  }, [tcpProbe]);

  // Los equipos quedan disponibles sin conexión para el historial (RF-08).
  async function saveDevices(devices: Device[]) {
    if (!devices.length) return '';
    try {
      const repository = await getRepository();
      await repository.saveDevices(devices);
      return 'Guardados en el dispositivo.';
    } catch {
      return 'No se pudieron guardar en el dispositivo.';
    }
  }

  function start(kind: Running) {
    if (running.current) return false;
    running.current = kind;
    setBusy(kind);
    return true;
  }

  function finish() {
    running.current = undefined;
    if (mounted.current) {
      setBusy(undefined);
    }
  }

  async function scan() {
    if (!start('mdns')) {
      return;
    }
    setResult(undefined);
    setMessage('Buscando servicios anunciados en la red durante 12 segundos…');
    try {
      const scanResult = await androidDiscovery.discover({
        siteId: LOCAL_SITE_ID,
        timeoutMs: 12000,
      });
      const saved = await saveDevices(scanResult.devices);
      if (!mounted.current) {
        return;
      }
      setNetwork(scanResult.network);
      setResult(scanResult);
      setMessage(
        scanResult.devices.length
          ? `Búsqueda terminada: ${scanResult.devices.length} equipo(s) con servicios mDNS. ${saved}`
          : 'No se encontraron servicios mDNS. Esto no significa que la red no tenga equipos.',
      );
    } catch (error) {
      if (mounted.current) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'No se pudo completar la búsqueda.',
        );
      }
    } finally {
      finish();
    }
  }

  async function sweepRange() {
    const parsed = parseRange(range ?? suggestedRange(network?.address));
    if ('error' in parsed) {
      setSweepMessage(parsed.error);
      return;
    }
    if (!start('sweep')) {
      return;
    }
    cancelled.current = false;
    setSwept(undefined);
    setProgress({ checked: 0, total: parsed.hosts.length, found: 0 });
    setSweepMessage('');
    try {
      const hits = await sweep(parsed.hosts, tcpProbe.probe, {
        concurrency: SWEEP_CONCURRENCY,
        onProgress: value => mounted.current && setProgress(value),
        isCancelled: () => cancelled.current,
      });
      if (cancelled.current) throw new Error('Barrido cancelado.');
      const devices = devicesFromProbe(hits, LOCAL_SITE_ID, new Date());
      const saved = await saveDevices(devices);
      if (!mounted.current) {
        return;
      }
      setSwept(devices);
      setSweepMessage(
        devices.length
          ? `Barrido terminado: ${devices.length} equipo(s) con puertos abiertos. ${saved}`
          : 'Ningún equipo del rango respondió en los puertos probados.',
      );
    } catch (error) {
      if (mounted.current) {
        setSweepMessage(
          cancelled.current
            ? 'Barrido cancelado.'
            : error instanceof Error
            ? error.message
            : 'No se pudo completar el barrido.',
        );
      }
    } finally {
      finish();
    }
  }

  function cancelSweep() {
    cancelled.current = true;
    tcpProbe.cancel();
  }

  const shownRange = range ?? suggestedRange(network?.address);

  return (
    <Screen>
      <Text style={styles.tag}>RF-01 · mDNS Y BARRIDO TCP</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Equipos en la red
      </Text>
      <Text style={styles.body}>
        Buscá equipos que anuncien servicios por mDNS o barré un rango de la
        LAN probando puertos de administración. No requiere Internet.
      </Text>
      {network && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Red actual: {network.transport}</Text>
          <Text selectable style={styles.body}>
            IP del dispositivo: {network.address}
          </Text>
          {network.emulator && (
            <Text style={styles.body}>
              Estás usando la red virtual del emulador: no recibe los anuncios
              mDNS de la LAN de tu PC, pero el barrido sí llega a sus IP a
              través de la PC.
            </Text>
          )}
        </View>
      )}

      <Text style={styles.subtitle}>Búsqueda mDNS</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar equipos"
        accessibilityState={{ disabled: !!busy }}
        disabled={!!busy}
        onPress={scan}
        style={[styles.button, busy && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {busy === 'mdns' ? 'Buscando…' : 'Buscar equipos'}
        </Text>
      </Pressable>
      {busy === 'mdns' && (
        <>
          <ActivityIndicator
            color={colors.accent}
            accessibilityLabel="Búsqueda en curso"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar búsqueda"
            onPress={() => androidDiscovery.cancel()}
            style={styles.card}
          >
            <Text style={styles.subtitle}>Cancelar búsqueda</Text>
          </Pressable>
        </>
      )}
      <Text accessibilityLiveRegion="polite" style={styles.body}>
        {message}
      </Text>
      {result?.warnings.map(warning => (
        <Text key={warning} style={styles.body}>
          {warning}
        </Text>
      ))}
      {result?.devices.map(device => (
        <DeviceCard
          key={device.id}
          device={device}
          onPress={() => navigation.navigate('DeviceDetails', { device })}
        />
      ))}

      <Text style={styles.subtitle}>Barrido de rango</Text>
      <Text style={styles.body}>
        Intenta una conexión TCP a los puertos 22, 23, 80, 443, 8080 y 8291 de
        cada IP. Solo redes privadas, hasta 256 direcciones.
      </Text>
      <TextInput
        accessibilityLabel="Rango a barrer"
        style={styles.input}
        value={shownRange}
        onChangeText={setRange}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="192.168.1.1-254"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Barrer rango"
        accessibilityState={{ disabled: !!busy }}
        disabled={!!busy}
        onPress={sweepRange}
        style={[styles.button, busy && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {busy === 'sweep' ? 'Barriendo…' : 'Barrer rango'}
        </Text>
      </Pressable>
      {busy === 'sweep' && progress && (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Revisadas {progress.checked} de {progress.total} · {progress.found}{' '}
            equipo(s)
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar barrido"
            onPress={cancelSweep}
            style={styles.card}
          >
            <Text style={styles.subtitle}>Cancelar barrido</Text>
          </Pressable>
        </>
      )}
      {sweepMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {sweepMessage}
        </Text>
      ) : null}
      {swept?.map(device => (
        <DeviceCard
          key={device.id}
          device={device}
          onPress={() => navigation.navigate('DeviceDetails', { device })}
        />
      ))}

      <View style={styles.card}>
        <Text style={styles.subtitle}>Cómo interpretar los resultados</Text>
        <Text style={styles.body}>
          mDNS solo encuentra equipos que anuncian alguno de los servicios
          buscados. El barrido encuentra los que aceptan conexiones en los
          puertos probados: un equipo con todo cerrado no aparece.
        </Text>
        <Text style={styles.body}>
          La MAC no se informa: desde Android 10 las apps no pueden leer la
          tabla ARP. El hostname se muestra solo cuando mDNS lo entrega. Los
          equipos encontrados se guardan en el dispositivo para consultarlos
          sin conexión.
        </Text>
      </View>
    </Screen>
  );
}

function DeviceCard({ device, onPress }: { device: Device; onPress: () => void }) {
  const services = device.services
    ?.map(service =>
      device.discoveryMethod === 'tcp-probe'
        ? `${service.name} (${service.port})`
        : service.name,
    )
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver equipo ${device.ip}`}
      onPress={onPress}
      style={styles.card}
    >
      <Text style={styles.subtitle}>{device.ip}</Text>
      {device.hostname ? <Text style={styles.body}>{device.hostname}</Text> : null}
      <Text style={styles.body}>{services}</Text>
      <Text style={styles.body}>MAC: no disponible en Android 10+</Text>
      <Text style={styles.link}>Ver detalle del equipo</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tag: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    gap: 10,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
});
