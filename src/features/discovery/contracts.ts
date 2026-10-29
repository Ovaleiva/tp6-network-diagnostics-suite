import type { Device, EntityId } from '../../core/domain/models';

export type LanInfo = { address: string; transport: string; emulator: boolean };
export type DiscoveryResult = {
  devices: Device[];
  network: LanInfo;
  warnings: string[];
};

export interface DiscoveryService {
  getNetworkInfo(): Promise<LanInfo>;
  discover(options: {
    siteId: EntityId;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<DiscoveryResult>;
  cancel(): void;
}
