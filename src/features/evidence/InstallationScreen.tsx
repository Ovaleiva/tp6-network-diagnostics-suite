import React from 'react';
import { ModuleScreen } from '../../shared/components/ModuleScreen';

export function InstallationScreen() {
  return (
    <ModuleScreen
      title="Instalación"
      requirement="RF-05"
      description="La visita reunirá notas, fotos y ubicación. Guardar la visita no dependerá de una conexión al backend."
      emptyMessage="Todavía no hay una instalación registrada."
      nextSteps={[
        'Registrar sitio, equipo y notas técnicas.',
        'Capturar fotos y GPS, manejando permisos y ausencia de señal.',
        'Guardar la instalación localmente y preparar la generación de su reporte.',
      ]}
    />
  );
}
