import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Abre un PDF de la carpeta de reportes de la app con un visor del sistema.
  open(path: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('NativePdfViewer');
