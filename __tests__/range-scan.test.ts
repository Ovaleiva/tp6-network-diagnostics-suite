import {
  devicesFromProbe,
  isPrivateIpv4,
  parseRange,
  suggestedRange,
  sweep,
} from '../src/features/discovery/rangeScan';

function hostsOf(input: string) {
  const parsed = parseRange(input);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.hosts;
}

describe('parseRange', () => {
  test('rango del último octeto', () => {
    const hosts = hostsOf('192.168.1.1-254');
    expect(hosts).toHaveLength(254);
    expect(hosts[0]).toBe('192.168.1.1');
    expect(hosts[253]).toBe('192.168.1.254');
  });

  test('red CIDR sin dirección de red ni broadcast', () => {
    expect(hostsOf('10.0.0.0/30')).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(hostsOf('192.168.1.77/24')).toHaveLength(254);
  });

  test('una sola IP', () => {
    expect(hostsOf(' 172.16.5.9 ')).toEqual(['172.16.5.9']);
  });

  test('rechaza redes públicas, rangos grandes y textos inválidos', () => {
    expect(parseRange('8.8.8.1-10')).toEqual({ error: expect.stringMatching(/redes privadas/) });
    expect(parseRange('192.168.0.0/16')).toEqual({ error: expect.stringMatching(/\/24 a \/30/) });
    expect(parseRange('192.168.1.200-100')).toEqual({ error: expect.stringMatching(/Rango inválido/) });
    expect(parseRange('192.168.1.1-300')).toEqual({ error: expect.stringMatching(/Rango inválido/) });
    expect(parseRange('router')).toEqual({ error: expect.stringMatching(/Ingrese un rango/) });
  });
});

test('isPrivateIpv4 reconoce solo RFC 1918', () => {
  expect(['10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.0.1'].every(isPrivateIpv4)).toBe(true);
  expect(['172.32.0.1', '192.169.0.1', '8.8.8.8', '1.2.3'].some(isPrivateIpv4)).toBe(false);
});

test('el rango sugerido es la /24 de la IP del teléfono', () => {
  expect(suggestedRange('192.168.1.89')).toBe('192.168.1.1-254');
  expect(suggestedRange(undefined)).toBe('192.168.1.1-254');
});

test('sweep respeta la concurrencia, informa el progreso y ordena por IP', async () => {
  let active = 0;
  let peak = 0;
  const open: Record<string, number[]> = { '192.168.1.20': [443, 80], '192.168.1.3': [22] };
  const progress: number[] = [];
  const hits = await sweep(hostsOf('192.168.1.1-30'), async ip => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>(resolve => setTimeout(resolve, 1));
    active--;
    return open[ip] ?? [];
  }, { concurrency: 4, onProgress: p => progress.push(p.checked) });
  expect(peak).toBe(4);
  expect(progress).toHaveLength(30);
  expect(progress[29]).toBe(30);
  expect(hits).toEqual([
    { ip: '192.168.1.3', ports: [22] },
    { ip: '192.168.1.20', ports: [443, 80] },
  ]);
});

test('sweep deja de tomar hosts al cancelarse', async () => {
  let calls = 0;
  let cancelled = false;
  await sweep(hostsOf('10.0.0.1-50'), async () => {
    calls++;
    if (calls === 5) cancelled = true;
    return [];
  }, { concurrency: 1, isCancelled: () => cancelled });
  expect(calls).toBe(5);
});

test('devicesFromProbe nombra los puertos y no inventa MAC ni hostname', () => {
  const [device] = devicesFromProbe(
    [{ ip: '192.168.1.1', ports: [23, 80, 443] }],
    'sitio-local',
    new Date('2026-11-03T15:00:00Z'),
  );
  expect(device).toEqual({
    id: 'sitio-local:192.168.1.1',
    siteId: 'sitio-local',
    ip: '192.168.1.1',
    discoveredAt: '2026-11-03T15:00:00.000Z',
    discoveryMethod: 'tcp-probe',
    services: [
      { name: 'Telnet', type: 'tcp', port: 23 },
      { name: 'HTTP', type: 'tcp', port: 80 },
      { name: 'HTTPS', type: 'tcp', port: 443 },
    ],
  });
});
