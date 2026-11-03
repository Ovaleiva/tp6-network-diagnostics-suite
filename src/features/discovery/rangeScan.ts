import type { Device, EntityId } from '../../core/domain/models';

// Puertos de administración habituales en equipos de red. 161 es UDP (SNMP):
// no sirve para una sonda TCP.
export const PROBE_PORTS = [22, 23, 80, 443, 8080, 8291] as const;

const PORT_NAMES: Record<number, string> = {
  22: 'SSH',
  23: 'Telnet',
  80: 'HTTP',
  443: 'HTTPS',
  8080: 'HTTP alternativo',
  8291: 'MikroTik Winbox',
};

export const MAX_HOSTS = 256;

export type ProbeFn = (host: string) => Promise<number[]>;

export type SweepProgress = { checked: number; total: number; found: number };

export type ProbeHit = { ip: string; ports: number[] };

function octets(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const values = parts.map(Number);
  return values.every(value => value <= 255) ? values : null;
}

export function isPrivateIpv4(ip: string): boolean {
  const value = octets(ip);
  if (!value) return false;
  const [a, b] = value;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function toNumber([a, b, c, d]: number[]) {
  return ((a * 256 + b) * 256 + c) * 256 + d;
}

function toIp(value: number) {
  return [2 ** 24, 2 ** 16, 2 ** 8, 1].map(unit => Math.floor(value / unit) % 256).join('.');
}

// Acepta "192.168.1.1-254" (rango del último octeto), "192.168.1.0/24"
// (de /24 a /30, sin red ni broadcast) o una sola IP. Solo redes privadas.
export function parseRange(input: string): { hosts: string[] } | { error: string } {
  const text = input.trim();
  let first: number;
  let last: number;
  const dash = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)(\d{1,3})-(\d{1,3})$/.exec(text);
  const cidr = /^([\d.]+)\/(\d{1,2})$/.exec(text);
  if (dash) {
    const start = octets(dash[1] + dash[2]);
    const end = Number(dash[3]);
    if (!start || end > 255 || end < start[3]) {
      return { error: 'Rango inválido. Ejemplo: 192.168.1.1-254.' };
    }
    first = toNumber(start);
    last = first + (end - start[3]);
  } else if (cidr) {
    const base = octets(cidr[1]);
    const prefix = Number(cidr[2]);
    if (!base || prefix < 24 || prefix > 30) {
      return { error: 'Use una red de /24 a /30. Ejemplo: 192.168.1.0/24.' };
    }
    const size = 2 ** (32 - prefix);
    const network = toNumber(base) - (toNumber(base) % size);
    first = network + 1;
    last = network + size - 2;
  } else {
    const single = octets(text);
    if (!single) {
      return { error: 'Ingrese un rango como 192.168.1.1-254, una red /24 o una IP.' };
    }
    first = last = toNumber(single);
  }
  if (last - first + 1 > MAX_HOSTS) {
    return { error: `El barrido admite hasta ${MAX_HOSTS} direcciones.` };
  }
  const hosts: string[] = [];
  for (let value = first; value <= last; value++) hosts.push(toIp(value));
  if (!hosts.every(isPrivateIpv4)) {
    return { error: 'El barrido solo recorre redes privadas (10.x, 172.16–31.x, 192.168.x).' };
  }
  return { hosts };
}

// Rango sugerido: la /24 de la IP del teléfono.
export function suggestedRange(deviceIp: string | undefined): string {
  const value = deviceIp && octets(deviceIp);
  return value ? `${value[0]}.${value[1]}.${value[2]}.1-254` : '192.168.1.1-254';
}

// Recorre los hosts con a lo sumo `concurrency` sondas a la vez. Un host
// cuenta como activo si al menos un puerto aceptó la conexión.
export async function sweep(
  hosts: string[],
  probe: ProbeFn,
  options: {
    concurrency: number;
    onProgress?: (progress: SweepProgress) => void;
    isCancelled?: () => boolean;
  },
): Promise<ProbeHit[]> {
  const hits: ProbeHit[] = [];
  let next = 0;
  let checked = 0;
  async function worker() {
    while (next < hosts.length && !options.isCancelled?.()) {
      const ip = hosts[next++];
      const ports = await probe(ip);
      checked++;
      if (ports.length) hits.push({ ip, ports });
      options.onProgress?.({ checked, total: hosts.length, found: hits.length });
    }
  }
  const workers = Math.max(1, Math.min(options.concurrency, hosts.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return hits.sort((a, b) => toNumber(octets(a.ip)!) - toNumber(octets(b.ip)!));
}

export function devicesFromProbe(hits: ProbeHit[], siteId: EntityId, now: Date): Device[] {
  const discoveredAt = now.toISOString();
  return hits.map(hit => ({
    id: `${siteId}:${hit.ip}`,
    siteId,
    ip: hit.ip,
    discoveredAt,
    discoveryMethod: 'tcp-probe',
    services: hit.ports.map(port => ({
      name: PORT_NAMES[port] ?? `TCP ${port}`,
      type: 'tcp',
      port,
    })),
  }));
}
