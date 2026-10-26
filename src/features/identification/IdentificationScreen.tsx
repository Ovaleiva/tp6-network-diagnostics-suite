import React from 'react';
import { ModuleScreen } from '../../shared/components/ModuleScreen';

export function IdentificationScreen() {
  return (
    <ModuleScreen
      title="Identificar equipo"
      requirement="RF-04"
      description="Un código identifica un equipo; la ficha técnica se consultará al backend y se conservará localmente para próximas visitas."
      emptyMessage="Todavía no se leyó un código."
      nextSteps={[
        'Solicitar permiso de cámara cuando se use el lector.',
        'Validar el QR o código de barras y buscar su ficha.',
        'Mostrar la ficha local si existe; indicar si nunca se descargó.',
      ]}
    />
  );
}
