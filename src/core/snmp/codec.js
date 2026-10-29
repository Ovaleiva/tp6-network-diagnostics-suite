'use strict';

// A bounded SNMPv2c GetRequest/Response subset (RFC 1901 / RFC 3416).
// Arithmetic deliberately avoids signed JavaScript bitwise operations on Counter32.
const MAX_PACKET = 8192;
const MAX_BINDINGS = 32;
const UINT32_MAX = 4294967295;
const INT32_MAX = 2147483647;
const TAGS = {
  string: 0x04,
  integer: 0x02,
  counter32: 0x41,
  timeticks: 0x43,
  noSuchObject: 0x80,
  noSuchInstance: 0x81,
};

function fail(detail) {
  throw new Error(detail);
}

function range(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${label} fuera del rango permitido.`);
  }
  return value;
}

function ascii(value, community = false) {
  if (
    typeof value !== 'string' ||
    value.length > 255 ||
    (community && value.length === 0) ||
    [...value].some(char => {
      const code = char.charCodeAt(0);
      return code > 127 || (community && (code < 32 || code > 126));
    })
  ) {
    fail(
      community
        ? 'La comunidad debe contener entre 1 y 255 caracteres ASCII imprimibles.'
        : 'DisplayString debe contener como máximo 255 caracteres ASCII.',
    );
  }
  return Array.from(value, char => char.charCodeAt(0));
}

function tlv(tag, value) {
  const length = value.length;
  range(length, 0, MAX_PACKET, 'Longitud BER');
  const prefix =
    length < 128
      ? [length]
      : length < 256
      ? [0x81, length]
      : [0x82, Math.floor(length / 256), length % 256];
  return [tag, ...prefix, ...value];
}

function integer(value, tag = 0x02, unsigned = false) {
  range(
    value,
    unsigned ? 0 : -2147483648,
    unsigned ? UINT32_MAX : INT32_MAX,
    'Entero SNMP',
  );
  const negative = value < 0;
  let rest = negative ? value + 4294967296 : value;
  const bytes = [];
  do {
    bytes.unshift(rest % 256);
    rest = Math.floor(rest / 256);
  } while (rest > 0);
  if (negative) {
    while (bytes.length > 1 && bytes[0] === 255 && bytes[1] >= 128) {
      bytes.shift();
    }
  } else if (bytes[0] >= 128) {
    bytes.unshift(0);
  }
  return tlv(tag, bytes);
}

function base128(value) {
  const result = [value % 128];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    result.unshift((rest % 128) + 128);
    rest = Math.floor(rest / 128);
  }
  return result;
}

function encodeOid(oid) {
  if (
    typeof oid !== 'string' ||
    !/^(0|[1-9]\d*)(\.(0|[1-9]\d*))+$/u.test(oid)
  ) {
    fail('OID inválido.');
  }
  const arcs = oid.split('.').map(Number);
  if (arcs.length > 128 || arcs[0] > 2 || (arcs[0] < 2 && arcs[1] > 39)) {
    fail('OID inválido.');
  }
  arcs.forEach(arc => range(arc, 0, UINT32_MAX, 'Componente OID'));
  return tlv(0x06, [
    ...base128(arcs[0] * 40 + arcs[1]),
    ...arcs.slice(2).flatMap(base128),
  ]);
}

function validateOids(oids, requireUnique = true) {
  if (!Array.isArray(oids) || oids.length < 1 || oids.length > MAX_BINDINGS) {
    fail('Se requieren entre 1 y 32 OIDs.');
  }
  oids.forEach(encodeOid);
  if (requireUnique && new Set(oids).size !== oids.length) {
    fail('La consulta contiene OIDs duplicados.');
  }
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.position = 0;
  }

  read(expectedTag) {
    if (this.position + 2 > this.bytes.length) {
      fail('Paquete BER truncado.');
    }
    const tag = this.bytes[this.position++];
    let length = this.bytes[this.position++];
    if (length >= 128) {
      const count = length - 128;
      if (count < 1 || count > 2 || this.position + count > this.bytes.length) {
        fail('Longitud BER inválida o indefinida.');
      }
      length = 0;
      for (let index = 0; index < count; index++) {
        length = length * 256 + this.bytes[this.position++];
      }
    }
    if (this.position + length > this.bytes.length) {
      fail('Valor BER truncado.');
    }
    if (expectedTag !== undefined && tag !== expectedTag) {
      fail('Etiqueta BER inesperada.');
    }
    const child = new Reader(
      this.bytes.slice(this.position, this.position + length),
    );
    child.tag = tag;
    this.position += length;
    return child;
  }

  end() {
    if (this.position !== this.bytes.length) {
      fail('El paquete BER contiene datos adicionales.');
    }
  }
}

function numberValue(reader, unsigned = false) {
  const bytes = reader.bytes;
  if (bytes.length === 0 || bytes.length > (unsigned ? 5 : 4)) {
    fail('Entero BER inválido.');
  }
  if (
    bytes.length > 1 &&
    ((bytes[0] === 0 && bytes[1] < 128) ||
      (bytes[0] === 255 && bytes[1] >= 128))
  ) {
    fail('Entero BER no mínimo.');
  }
  let value = bytes.reduce((total, byte) => total * 256 + byte, 0);
  if (bytes[0] >= 128) {
    if (unsigned) {
      fail('Contador SNMP negativo.');
    }
    value -= 256 ** bytes.length;
  }
  return range(
    value,
    unsigned ? 0 : -2147483648,
    unsigned ? UINT32_MAX : INT32_MAX,
    'Entero SNMP',
  );
}

function stringValue(reader, community = false) {
  const value = String.fromCharCode(...reader.bytes);
  ascii(value, community);
  return value;
}

function oidValue(reader) {
  const identifiers = [];
  let value = 0;
  let pending = false;
  for (const byte of reader.bytes) {
    if (!pending && byte === 128) {
      fail('Componente OID no mínimo.');
    }
    value = value * 128 + (byte % 128);
    range(
      value,
      0,
      identifiers.length === 0 ? UINT32_MAX + 80 : UINT32_MAX,
      'Componente OID',
    );
    pending = byte >= 128;
    if (!pending) {
      identifiers.push(value);
      value = 0;
    }
  }
  if (pending || identifiers.length === 0) {
    fail('OID BER truncado o vacío.');
  }
  const first = identifiers.shift();
  const arc = first < 40 ? 0 : first < 80 ? 1 : 2;
  const oid = [arc, first - arc * 40, ...identifiers].join('.');
  encodeOid(oid);
  return oid;
}

function message(requestId, community, bindings, pduTag, error = {}) {
  range(requestId, 1, INT32_MAX, 'Identificador de consulta');
  const packet = tlv(0x30, [
    ...integer(1),
    ...tlv(0x04, ascii(community, true)),
    ...tlv(pduTag, [
      ...integer(requestId),
      ...integer(range(error.errorStatus ?? 0, 0, 18, 'Estado SNMP')),
      ...integer(
        range(error.errorIndex ?? 0, 0, MAX_BINDINGS, 'Índice de error'),
      ),
      ...tlv(0x30, bindings.flat()),
    ]),
  ]);
  range(packet.length, 1, MAX_PACKET, 'Tamaño del paquete SNMP');
  return packet;
}

function parseMessage(bytes, pduTag) {
  if (
    !Array.isArray(bytes) ||
    bytes.length === 0 ||
    bytes.length > MAX_PACKET ||
    bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)
  ) {
    fail('Paquete SNMP inválido o demasiado grande.');
  }
  const packet = new Reader(bytes);
  const sequence = packet.read(0x30);
  packet.end();
  if (numberValue(sequence.read(0x02)) !== 1) {
    fail('Se requiere SNMPv2c.');
  }
  const community = stringValue(sequence.read(0x04), true);
  const pdu = sequence.read(pduTag);
  sequence.end();
  const requestId = range(
    numberValue(pdu.read(0x02)),
    1,
    INT32_MAX,
    'Identificador de consulta',
  );
  const errorStatus = range(numberValue(pdu.read(0x02)), 0, 18, 'Estado SNMP');
  const errorIndex = range(
    numberValue(pdu.read(0x02)),
    0,
    MAX_BINDINGS,
    'Índice de error',
  );
  const list = pdu.read(0x30);
  pdu.end();
  return { requestId, community, errorStatus, errorIndex, list };
}

function readBindings(list, decodeValue) {
  const bindings = [];
  while (list.position < list.bytes.length) {
    if (bindings.length >= MAX_BINDINGS) {
      fail('La respuesta supera los 32 OIDs.');
    }
    const binding = list.read(0x30);
    const oid = oidValue(binding.read(0x06));
    const result = decodeValue(binding.read());
    binding.end();
    bindings.push({ oid, ...result });
  }
  return bindings;
}

function encodeGetRequest(requestId, community, oids) {
  validateOids(oids);
  return message(
    requestId,
    community,
    oids.map(oid => tlv(0x30, [...encodeOid(oid), 0x05, 0])),
    0xa0,
  );
}

function decodeGetRequest(bytes) {
  const { requestId, community, errorStatus, errorIndex, list } = parseMessage(
    bytes,
    0xa0,
  );
  if (errorStatus !== 0 || errorIndex !== 0) {
    fail('GetRequest con estado de error inválido.');
  }
  const oids = readBindings(list, value => {
    if (value.tag !== 0x05 || value.bytes.length !== 0) {
      fail('GetRequest requiere valores NULL.');
    }
    return {};
  }).map(binding => binding.oid);
  validateOids(oids);
  return { requestId, community, oids };
}

function encodeResponse(requestId, community, bindings, error) {
  if (!Array.isArray(bindings) || bindings.length > MAX_BINDINGS) {
    fail('La respuesta supera los 32 OIDs.');
  }
  return message(
    requestId,
    community,
    bindings.map(binding => {
      const tag = TAGS[binding.type];
      let value;
      if (binding.type === 'string') {
        value = tlv(tag, ascii(binding.value));
      } else if (
        binding.type === 'noSuchObject' ||
        binding.type === 'noSuchInstance'
      ) {
        if (binding.value !== null) {
          fail('La excepción SNMP requiere un valor nulo.');
        }
        value = tlv(tag, []);
      } else if (
        binding.type === 'integer' ||
        binding.type === 'timeticks' ||
        binding.type === 'counter32'
      ) {
        value = integer(binding.value, tag, binding.type !== 'integer');
      } else {
        fail('Tipo de valor SNMP no admitido.');
      }
      return tlv(0x30, [...encodeOid(binding.oid), ...value]);
    }),
    0xa2,
    error,
  );
}

function decodeResponse(bytes, expected) {
  range(expected.requestId, 1, INT32_MAX, 'Identificador de consulta');
  ascii(expected.community, true);
  validateOids(expected.oids);
  const response = parseMessage(bytes, 0xa2);
  if (
    response.requestId !== expected.requestId ||
    response.community !== expected.community
  ) {
    fail('La respuesta no corresponde a la consulta SNMP.');
  }
  if (response.errorStatus !== 0 || response.errorIndex !== 0) {
    fail(
      `El agente informó un error SNMP (${response.errorStatus}, índice ${response.errorIndex}).`,
    );
  }
  const bindings = readBindings(response.list, value => {
    if (value.tag === 0x80 || value.tag === 0x81 || value.tag === 0x82) {
      fail('El agente no dispone del OID o de la instancia solicitada.');
    }
    const type = Object.keys(TAGS).find(key => TAGS[key] === value.tag);
    if (type === 'string') {
      return { type, value: stringValue(value) };
    }
    if (type === 'integer' || type === 'timeticks' || type === 'counter32') {
      return { type, value: numberValue(value, type !== 'integer') };
    }
    return fail('Tipo de valor SNMP no admitido.');
  });
  const received = new Set(bindings.map(binding => binding.oid));
  if (
    bindings.length !== expected.oids.length ||
    received.size !== bindings.length ||
    expected.oids.some(oid => !received.has(oid))
  ) {
    fail('La respuesta contiene OIDs inesperados, duplicados o faltantes.');
  }
  return bindings;
}

function oidsForInterface(index) {
  range(index, 1, INT32_MAX, 'Índice de interfaz');
  return {
    sysName: '1.3.6.1.2.1.1.5.0',
    uptime: '1.3.6.1.2.1.1.3.0',
    inOctets: `1.3.6.1.2.1.2.2.1.10.${index}`,
    outOctets: `1.3.6.1.2.1.2.2.1.16.${index}`,
  };
}

module.exports = {
  encodeGetRequest,
  decodeGetRequest,
  encodeResponse,
  decodeResponse,
  oidsForInterface,
};
