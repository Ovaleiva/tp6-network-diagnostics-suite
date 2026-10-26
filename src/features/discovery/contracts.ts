import type { Device, EntityId } from '../../core/domain/models';

export interface DiscoveryService {
  discover(options: {
    siteId: EntityId;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<Device[]>;
}
