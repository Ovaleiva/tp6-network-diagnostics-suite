import {
  decodeResponse,
  encodeGetRequest,
  oidsForInterface,
} from '../../core/snmp/codec';
import type { Binding } from '../../core/snmp/codec';
import type { SnmpService } from '../../features/protocols/contracts';
import NativeUdpTransport from '../../specs/NativeUdpTransport';

function valueFor(bindings: Binding[], oid: string, type: Binding['type']) {
  const binding = bindings.find(item => item.oid === oid);
  if (!binding || binding.type !== type)
    throw new Error('El dispositivo devolvió un tipo SNMP inesperado.');
  return binding.value;
}

export const androidSnmp: SnmpService = {
  async readBasicStatus(device, options) {
    const { port, timeoutMs, community, interfaceIndex } = options;
    const parts = device.ip.split('.');
    if (
      parts.length !== 4 ||
      parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)
    )
      throw new Error('Ingrese una dirección IPv4 válida.');
    if (
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 15000
    )
      throw new Error(
        'El puerto debe estar entre 1 y 65535 y el plazo entre 100 y 15000 ms.',
      );
    const names = oidsForInterface(interfaceIndex);
    const oids = Object.values(names);
    const requestId = 1 + Math.floor(Math.random() * 2147483647);
    const payload = encodeGetRequest(requestId, community, oids);
    if (!NativeUdpTransport)
      throw new Error(
        'El transporte UDP no está instalado. Compile e instale nuevamente la app Android.',
      );
    const startedAt = new Date().toISOString();
    const response = await NativeUdpTransport.exchange(
      device.ip,
      port,
      payload,
      timeoutMs,
    );
    const bindings = decodeResponse(response, { requestId, community, oids });
    return {
      id: `snmp-${requestId}-${Date.now()}`,
      deviceId: device.id,
      siteId: device.siteId,
      protocol: 'snmp',
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'success',
      summary:
        'Nombre, uptime y contadores de interfaz consultados mediante SNMPv2c.',
      snmp: {
        sysName: valueFor(bindings, names.sysName, 'string') as string,
        uptimeTicks: valueFor(bindings, names.uptime, 'timeticks') as number,
        interfaceIndex,
        inOctets: valueFor(bindings, names.inOctets, 'counter32') as number,
        outOctets: valueFor(bindings, names.outOctets, 'counter32') as number,
      },
    };
  },
  cancel() {
    NativeUdpTransport?.cancel();
  },
};
