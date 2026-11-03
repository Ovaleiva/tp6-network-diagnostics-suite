import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Puertos de la lista que aceptaron una conexión TCP antes del plazo.
  // Solo admite IPv4 privadas (RFC 1918).
  probe(
    host: string,
    ports: ReadonlyArray<number>,
    timeoutMs: number,
  ): Promise<number[]>;
  // Corta las sondas en curso; sus promesas se rechazan con E_CANCELLED.
  cancel(): void;
}

export default TurboModuleRegistry.get<Spec>('NativeTcpProbe');
