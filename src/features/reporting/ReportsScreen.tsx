import React from 'react';
import { ModuleScreen } from '../../shared/components/ModuleScreen';

export function ReportsScreen() {
  return (
    <ModuleScreen
      title="Reportes"
      requirement="RF-06"
      description="Los PDF se generarán en el teléfono a partir de una instalación guardada y su evidencia local."
      emptyMessage="Todavía no hay reportes generados."
      nextSteps={[
        'Leer instalación, fotos y coordenadas desde el almacenamiento local.',
        'Generar y guardar el PDF con sus referencias de evidencia.',
        'Encolar el reporte para sincronizarlo cuando el backend sea accesible.',
      ]}
    />
  );
}
