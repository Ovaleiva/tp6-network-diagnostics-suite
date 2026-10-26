import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/routes';
import { ModuleScreen } from '../../shared/components/ModuleScreen';

export function DiagnosticsScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'Diagnostics'>) {
  const deviceId = route.params?.deviceId;
  return (
    <ModuleScreen
      title="Diagnóstico"
      requirement="RF-02 / RF-03"
      description="Las consultas de estado y la ejecución de comandos serán servicios separados de esta pantalla."
      emptyMessage={
        deviceId
          ? `Equipo seleccionado: ${deviceId}`
          : 'Primero necesitaremos seleccionar un equipo real.'
      }
      nextSteps={[
        'Validar transporte UDP y el subconjunto SNMP antes de codificarlo.',
        'Validar el cliente SSH y el almacenamiento seguro de credenciales.',
        'Registrar resultados y errores con tiempos de espera definidos.',
      ]}
    />
  );
}
