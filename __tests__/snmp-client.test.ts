import { androidSnmp } from '../src/infrastructure/protocols/androidSnmp';
import NativeUdpTransport from '../src/specs/NativeUdpTransport';
import { decodeGetRequest, encodeResponse } from '../src/core/snmp/codec';
import type { Binding } from '../src/core/snmp/codec';

jest.mock('../src/specs/NativeUdpTransport', () => ({
  __esModule: true,
  default: { exchange: jest.fn(), cancel: jest.fn() },
}));
const exchange = NativeUdpTransport!.exchange as jest.Mock;
const device = {
  id: 'lab',
  siteId: 'local',
  ip: '10.0.2.2',
  discoveryMethod: 'manual' as const,
  discoveredAt: '2026-10-28T00:00:00Z',
};
const options = {
  port: 1161,
  community: 'public',
  interfaceIndex: 1,
  timeoutMs: 3000,
};

beforeEach(() => jest.resetAllMocks());

function respond(offset = 0, wrongType = false) {
  exchange.mockImplementation(async (_host, _port, bytes) => {
    const request = decodeGetRequest(bytes);
    const values: Binding[] = request.oids.map((oid, index) => ({
      oid,
      type: index === 0 ? 'string' : index === 1 ? 'timeticks' : 'counter32',
      value: index === 0 ? 'TP6-LAB-PC' : index === 1 ? 12345 : 4294967295,
    }));
    if (wrongType) values[1] = { ...values[1]!, type: 'integer' };
    return encodeResponse(
      request.requestId + offset,
      request.community,
      values,
    );
  });
}

test('consulta cuatro OIDs y conserva TimeTicks y Counter32 sin convertirlos en tasas', async () => {
  respond();
  const result = await androidSnmp.readBasicStatus(device, options);
  expect(result.snmp).toEqual({
    sysName: 'TP6-LAB-PC',
    uptimeTicks: 12345,
    interfaceIndex: 1,
    inOctets: 4294967295,
    outOctets: 4294967295,
  });
  expect(result).toMatchObject({
    deviceId: 'lab',
    protocol: 'snmp',
    status: 'success',
  });
  expect(exchange).toHaveBeenCalledWith(
    '10.0.2.2',
    1161,
    expect.any(Array),
    3000,
  );
  expect(JSON.stringify(result)).not.toContain('public');
});

test('rechaza una respuesta de otra solicitud y tipos inesperados', async () => {
  respond(1);
  await expect(androidSnmp.readBasicStatus(device, options)).rejects.toThrow();
  respond(0, true);
  await expect(androidSnmp.readBasicStatus(device, options)).rejects.toThrow(
    'tipo SNMP inesperado',
  );
});

test('rechaza entradas inválidas antes de transmitir y propaga el timeout', async () => {
  await expect(
    androidSnmp.readBasicStatus({ ...device, ip: '999.0.0.1' }, options),
  ).rejects.toThrow('IPv4');
  await expect(
    androidSnmp.readBasicStatus(device, { ...options, port: 1.5 }),
  ).rejects.toThrow('puerto');
  await expect(
    androidSnmp.readBasicStatus(device, { ...options, interfaceIndex: 0 }),
  ).rejects.toThrow();
  expect(exchange).not.toHaveBeenCalled();
  exchange.mockRejectedValue(new Error('Sin respuesta UDP'));
  await expect(androidSnmp.readBasicStatus(device, options)).rejects.toThrow(
    'Sin respuesta UDP',
  );
  androidSnmp.cancel();
  expect(NativeUdpTransport!.cancel).toHaveBeenCalledTimes(1);
});
