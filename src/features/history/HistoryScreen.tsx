import React from 'react';
import { ModuleScreen } from '../../shared/components/ModuleScreen';

export function HistoryScreen() {
  return (
    <ModuleScreen
      title="Historial"
      requirement="RF-08"
      description="El historial leerá la base local, de modo que se pueda consultar incluso después de cerrar la aplicación y sin Internet."
      emptyMessage="Todavía no hay diagnósticos guardados."
      nextSteps={[
        'Persistir cada diagnóstico y asociarlo a un equipo y sitio.',
        'Filtrar registros por equipo, sitio y fecha.',
        'Consultar resultados anteriores sin depender del backend.',
      ]}
    />
  );
}
