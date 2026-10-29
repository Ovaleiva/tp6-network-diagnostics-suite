import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/routes';
import { Screen } from '../../shared/components/Screen';
import { colors } from '../../shared/theme';

type Destination = Exclude<keyof RootStackParamList, 'Home' | 'DeviceDetails'>;
const modules: ReadonlyArray<{
  route: Destination;
  title: string;
  description: string;
  requirement: string;
}> = [
  {
    route: 'Devices',
    title: 'Equipos en la red',
    description: 'Descubrimiento de dispositivos en la LAN.',
    requirement: 'RF-01',
  },
  {
    route: 'Diagnostics',
    title: 'Diagnóstico',
    description: 'Consulta SNMPv2c de laboratorio. SSH pendiente.',
    requirement: 'RF-02 / RF-03',
  },
  {
    route: 'Identification',
    title: 'Identificar equipo',
    description: 'Lectura QR o barras y ficha técnica.',
    requirement: 'RF-04',
  },
  {
    route: 'Installation',
    title: 'Instalación',
    description: 'Fotos, coordenadas y notas de la visita.',
    requirement: 'RF-05',
  },
  {
    route: 'Reports',
    title: 'Reportes',
    description: 'Documentación de instalaciones en PDF.',
    requirement: 'RF-06',
  },
  {
    route: 'Sync',
    title: 'Sincronización',
    description: 'Acciones pendientes de envío al backend.',
    requirement: 'RF-07',
  },
  {
    route: 'History',
    title: 'Historial',
    description: 'Diagnósticos por equipo o sitio sin Internet.',
    requirement: 'RF-08',
  },
];

export function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  return (
    <Screen>
      <Text style={styles.eyebrow}>NETWORK DIAGNOSTICS SUITE</Text>
      <Text accessibilityRole="header" style={styles.heading}>
        Herramientas de campo
      </Text>
      <Text style={styles.description}>
        Diagnosticar, documentar y sincronizar.
      </Text>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          En desarrollo · mDNS y laboratorio SNMP
        </Text>
        <Text style={styles.description}>
          Equipos en la red busca servicios mDNS y Diagnóstico permite consultar
          SNMP. Identificación, SSH, instalaciones, PDF, sincronización e
          historial todavía están pendientes. La suite completa aún no está
          implementada.
        </Text>
      </View>
      {modules.map(module => (
        <Pressable
          key={module.route}
          accessibilityRole="button"
          accessibilityLabel={module.title}
          accessibilityHint={`Abrir ${module.title}`}
          onPress={() => navigation.navigate(module.route)}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <Text style={styles.requirement}>{module.requirement}</Text>
          <Text style={styles.requirement}>
            {module.route === 'Devices'
              ? 'BÚSQUEDA mDNS · RF-01 PARCIAL'
              : module.route === 'Diagnostics'
              ? 'SNMP EN LABORATORIO · SSH PENDIENTE'
              : 'PENDIENTE DE IMPLEMENTACIÓN'}
          </Text>
          <Text style={styles.title}>{module.title}</Text>
          <Text style={styles.description}>{module.description}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heading: { fontSize: 30, fontWeight: '700', color: colors.text },
  title: { fontSize: 19, fontWeight: '600', color: colors.text },
  description: { fontSize: 16, lineHeight: 24, color: colors.muted },
  notice: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.tag,
    gap: 8,
  },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: colors.accent },
  card: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
    minHeight: 100,
  },
  pressed: { opacity: 0.7 },
  requirement: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
