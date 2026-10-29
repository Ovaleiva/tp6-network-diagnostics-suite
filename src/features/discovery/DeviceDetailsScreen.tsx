import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/routes';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';

export function DeviceDetailsScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'DeviceDetails'>) {
  const { device } = route.params;
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Detalle del equipo
      </Text>
      <Text selectable style={styles.body}>
        IP: {device.ip}
      </Text>
      <Text style={styles.body}>
        Hostname: {device.hostname || 'no disponible'}
      </Text>
      <Text style={styles.body}>
        MAC: {device.mac || 'no disponible por mDNS'}
      </Text>
      <Text style={styles.body}>
        Detectado: {new Date(device.discoveredAt).toLocaleString()}
      </Text>
      <Text style={styles.body}>
        La detección confirma un anuncio mDNS; todavía no se verificó el estado
        del servicio con SNMP ni SSH.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Consultar SNMP"
        onPress={() =>
          navigation.navigate('Diagnostics', {
            deviceId: device.id,
            ip: device.ip,
          })
        }
        style={styles.card}
      >
        <Text style={styles.subtitle}>Consultar SNMP</Text>
      </Pressable>
      {device.services?.map(service => (
        <View key={`${service.type}:${service.port}`} style={styles.card}>
          <Text style={styles.subtitle}>{service.name}</Text>
          <Text selectable style={styles.body}>
            {service.type} · puerto {service.port}
          </Text>
        </View>
      ))}
    </Screen>
  );
}
const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  card: {
    padding: 18,
    gap: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
});
