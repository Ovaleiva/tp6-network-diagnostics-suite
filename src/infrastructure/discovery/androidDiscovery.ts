import { Platform } from 'react-native';
import NativeNetworkDiscovery from '../../specs/NativeNetworkDiscovery';
import type { Device } from '../../core/domain/models';
import type { DiscoveryService } from '../../features/discovery/contracts';
import type { MdnsScan } from '../../specs/NativeNetworkDiscovery';

function nativeModule() {
  if (Platform.OS !== 'android' || !NativeNetworkDiscovery) {
    throw new Error(
      'El módulo de descubrimiento requiere la nueva build Android. Ejecutá npm.cmd run android -- --active-arch-only --no-packager.',
    );
  }
  return NativeNetworkDiscovery;
}

export function devicesFromScan(scan: MdnsScan, siteId: string): Device[] {
  const devices = new Map<string, Device>();
  const discoveredAt = new Date().toISOString();
  for (const service of scan.services) {
    let device = devices.get(service.address);
    if (!device) {
      device = {
        id: `${siteId}:${service.address}`,
        siteId,
        ip: service.address,
        discoveredAt,
        discoveryMethod: 'mdns',
        services: [],
      };
      devices.set(service.address, device);
    }
    // El nombre de una instancia de servicio no identifica al host DNS.
    if (!device.hostname && service.hostname?.trim()) {
      device.hostname = service.hostname.trim();
    }
    if (
      !device.services!.some(
        item => item.type === service.type && item.port === service.port,
      )
    ) {
      device.services!.push({
        name: service.name,
        type: service.type,
        port: service.port,
      });
    }
  }
  return [...devices.values()].sort((a, b) =>
    a.ip.localeCompare(b.ip, undefined, { numeric: true }),
  );
}

export const androidDiscovery: DiscoveryService = {
  async getNetworkInfo() {
    return nativeModule().getNetworkInfo();
  },
  async discover({ siteId, timeoutMs, signal }) {
    if (signal?.aborted) {
      throw new Error('Búsqueda cancelada.');
    }
    const module = nativeModule();
    const cancel = () => module.cancelDiscovery();
    signal?.addEventListener('abort', cancel);
    try {
      const scan = await module.discover(timeoutMs);
      return {
        devices: devicesFromScan(scan, siteId),
        network: scan.network,
        warnings: scan.warnings,
      };
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  },
  cancel() {
    NativeNetworkDiscovery?.cancelDiscovery();
  },
};
