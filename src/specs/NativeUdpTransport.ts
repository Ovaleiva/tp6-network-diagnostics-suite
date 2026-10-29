import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  exchange(
    host: string,
    port: number,
    payload: ReadonlyArray<number>,
    timeoutMs: number,
  ): Promise<number[]>;
  cancel(): void;
}

export default TurboModuleRegistry.get<Spec>('NativeUdpTransport');
