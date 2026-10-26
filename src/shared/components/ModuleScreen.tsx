import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from './Screen';
import { colors } from '../theme';

type Props = {
  title: string;
  requirement: string;
  description: string;
  emptyMessage: string;
  nextSteps: readonly string[];
};

// Compartimos presentación, mientras cada pantalla conserva su responsabilidad.
export function ModuleScreen({
  title,
  requirement,
  description,
  emptyMessage,
  nextSteps,
}: Props) {
  return (
    <Screen>
      <Text style={styles.tag}>{requirement} · BASE DE NAVEGACIÓN</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.body}>{description}</Text>
      <View style={styles.card}>
        <Text style={styles.subtitle}>{emptyMessage}</Text>
        <Text style={styles.body}>
          Esta función todavía no está implementada. No hay mediciones ni datos
          guardados.
        </Text>
      </View>
      <Text accessibilityRole="header" style={styles.subtitle}>
        Qué incorporaremos
      </Text>
      {nextSteps.map((step, index) => (
        <View key={step} style={styles.step}>
          <Text style={styles.number}>{index + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tag: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    gap: 10,
  },
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  number: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  stepText: { flex: 1, fontSize: 16, lineHeight: 24, color: colors.muted },
});
