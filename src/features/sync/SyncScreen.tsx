import React from 'react';
import { ModuleScreen } from '../../shared/components/ModuleScreen';

export function SyncScreen() {
  return (
    <ModuleScreen
      title="Sincronización"
      requirement="RF-07"
      description="La outbox será una cola persistente de acciones pendientes. La interfaz no confundirá Wi-Fi conectado con backend disponible."
      emptyMessage="La cola persistente todavía no está conectada."
      nextSteps={[
        'Guardar cada cambio y su acción pendiente en una misma transacción.',
        'Enviar acciones con identificador estable para evitar duplicados.',
        'Reintentar fallos temporales y mostrar conflictos sin perder datos locales.',
      ]}
    />
  );
}
