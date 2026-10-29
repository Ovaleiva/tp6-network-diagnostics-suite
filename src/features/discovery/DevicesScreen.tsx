import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/routes';
import type { DiscoveryResult, LanInfo } from './contracts';
import { androidDiscovery } from '../../infrastructure/discovery/androidDiscovery';
import { LOCAL_SITE_ID } from '../../core/domain/models';
import type { LocalRepository } from '../local-store/contracts';
import { useRepository } from '../local-store/useRepository';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Devices'> & {
  // Se inyecta en pruebas; en la app se abre la base SQLite.
  repository?: LocalRepository;
};

export function DevicesScreen({ navigation, repository: injected }: Props) {
  const getRepository = useRepository(injected);
  const [network, setNetwork] = useState<LanInfo>();
  const [result, setResult] = useState<DiscoveryResult>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Todavía no se ejecutó una búsqueda.');
  const mounted = useRef(true);
  const running = useRef(false);

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
      if (running.current) {
        androidDiscovery.cancel();
      }
    };
  }, []);

  // Los equipos quedan disponibles sin conexión para el historial (RF-08).
  async function saveDevices(devices: DiscoveryResult['devices']) {
    if (!devices.length) return '';
    try {
      const repository = await getRepository();
      await repository.saveDevices(devices);
      return 'Guardados en el dispositivo.';
    } catch {
      return 'No se pudieron guardar en el dispositivo.';
    }
  }

  async function scan() {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
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
      running.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <Screen>
      <Text style={styles.tag}>RF-01 · DESCUBRIMIENTO mDNS</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Equipos en la red
      </Text>
      <Text style={styles.body}>
        Buscá equipos que anuncien servicios web, SSH, impresión, archivos o
        estación de trabajo. No requiere Internet.
      </Text>
      {network && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Red actual: {network.transport}</Text>
          <Text selectable style={styles.body}>
            IP del dispositivo: {network.address}
          </Text>
          {network.emulator && (
            <Text style={styles.body}>
              Estás usando la red virtual del emulador. Puede no recibir los
              anuncios de la LAN de tu PC. Una búsqueda vacía aquí no valida la
              LAN real.
            </Text>
          )}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar equipos"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={scan}
        style={[styles.button, busy && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {busy ? 'Buscando…' : 'Buscar equipos'}
        </Text>
      </Pressable>
      {busy && (
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
        <Pressable
          key={device.id}
          accessibilityRole="button"
          accessibilityLabel={`Ver equipo ${device.ip}`}
          onPress={() => navigation.navigate('DeviceDetails', { device })}
          style={styles.card}
        >
          <Text style={styles.subtitle}>{device.ip}</Text>
          <Text style={styles.body}>
            {device.services?.map(service => service.name).join(' · ')}
          </Text>
          <Text style={styles.body}>MAC: no disponible por mDNS</Text>
          <Text style={styles.link}>Ver detalle del equipo</Text>
        </Pressable>
      ))}
      <View style={styles.card}>
        <Text style={styles.subtitle}>Cómo interpretar la búsqueda</Text>
        <Text style={styles.body}>
          mDNS solo encuentra equipos que anuncian alguno de los servicios
          buscados. Revisá que ambos estén en la misma LAN y que el Wi-Fi
          permita comunicación entre dispositivos.
        </Text>
        <Text style={styles.body}>
          La MAC y el hostname no se inventan: si no están disponibles se
          indica. Esta primera integración aún no completa RF-01. Los resultados
          permanecen en esta pantalla; todavía no hay persistencia local.
        </Text>
      </View>
    </Screen>
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
