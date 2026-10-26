import React from 'react';
import { ModuleScreen } from '../../shared/components/ModuleScreen';

export function DevicesScreen() {
  return (
    <ModuleScreen
      title="Equipos en la red"
      requirement="RF-01"
      description="Esta pantalla mostrará dispositivos que respondan en la red local. La disponibilidad de Internet no determina el acceso a la LAN."
      emptyMessage="Todavía no se ejecutó un descubrimiento."
      nextSteps={[
        'Detectar la red y descubrir servicios mediante mDNS.',
        'Mostrar IP y, cuando estén disponibles, hostname y MAC.',
        'Seleccionar un equipo para abrir su diagnóstico.',
      ]}
    />
  );
}
