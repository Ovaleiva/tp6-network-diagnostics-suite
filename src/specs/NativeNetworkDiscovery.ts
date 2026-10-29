import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type LanInfo = {
  address: string;
  transport: string;
  emulator: boolean;
};

export type MdnsService = {
  address: string;
  hostname?: string;
  name: string;
  type: string;
  port: number;
};

export type MdnsScan = {
  network: LanInfo;
  services: MdnsService[];
  warnings: string[];
};

// Codegen genera la interfaz que debe implementar el módulo Kotlin.
export interface Spec extends TurboModule {
  getNetworkInfo(): Promise<LanInfo>;
  discover(timeoutMs: number): Promise<MdnsScan>;
  cancelDiscovery(): void;
}

export default TurboModuleRegistry.get<Spec>('NativeNetworkDiscovery');
