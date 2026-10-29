'use strict';

const dgram = require('node:dgram');
const { performance } = require('node:perf_hooks');
const {
  decodeGetRequest,
  encodeResponse,
  oidsForInterface,
} = require('../src/core/snmp/codec');

const ADDRESS = '127.0.0.1';
const DEFAULT_PORT = 1161;
const COMMUNITY = 'public';
const MODULUS = 4294967296;
const OIDS = oidsForInterface(1);

function validatePort(port, allowEphemeral) {
  if (
    !Number.isInteger(port) ||
    port < (allowEphemeral ? 0 : 1) ||
    port > 65535
  ) {
    throw new Error(
      'El puerto debe ser un entero entre 1 y 65535 (0 solo en pruebas).',
    );
  }
  return port;
}

async function startAgent({ port = DEFAULT_PORT } = {}) {
  validatePort(port, true);
  const socket = dgram.createSocket('udp4');
  const started = performance.now();
  let inOctets = 0;
  let outOctets = 0;
  let closing;

  function bindingFor(oid) {
    if (oid === OIDS.sysName) {
      return { oid, type: 'string', value: 'TP6-LAB-PC' };
    }
    if (oid === OIDS.uptime) {
      return {
        oid,
        type: 'timeticks',
        value: Math.floor((performance.now() - started) / 10) % MODULUS,
      };
    }
    if (oid === OIDS.inOctets || oid === OIDS.outOctets) {
      return {
        oid,
        type: 'counter32',
        value: oid === OIDS.inOctets ? inOctets : outOctets,
      };
    }
    const interfaceColumn = /^(1\.3\.6\.1\.2\.1\.2\.2\.1\.(10|16))(\.|$)/u.test(
      oid,
    );
    return {
      oid,
      type: interfaceColumn ? 'noSuchInstance' : 'noSuchObject',
      value: null,
    };
  }

  socket.on('message', (bytes, sender) => {
    // These are controlled endpoint payload octets, never physical-NIC counters.
    inOctets = (inOctets + bytes.length) % MODULUS;
    if (bytes.length > 8192 || closing) {
      return;
    }
    let request;
    try {
      request = decodeGetRequest(Array.from(bytes));
    } catch {
      return;
    }
    if (request.community !== COMMUNITY) {
      return;
    }
    const packet = Buffer.from(
      encodeResponse(
        request.requestId,
        COMMUNITY,
        request.oids.map(bindingFor),
      ),
    );
    socket.send(packet, sender.port, sender.address, error => {
      if (!error) {
        outOctets = (outOctets + packet.length) % MODULUS;
      }
    });
  });

  await new Promise((resolve, reject) => {
    function onBindError(error) {
      socket.close();
      reject(error);
    }
    socket.once('error', onBindError);
    socket.bind(port, ADDRESS, () => {
      socket.removeListener('error', onBindError);
      resolve();
    });
  });
  // Runtime socket errors are exposed without logging packet or community data.
  socket.on('error', () => {
    console.error('Laboratorio SNMP: error del socket UDP.');
  });
  return {
    port: socket.address().port,
    close() {
      if (!closing) {
        closing = new Promise(resolve => socket.close(resolve));
      }
      return closing;
    },
  };
}

function cliPort(args) {
  if (args.length === 0) {
    return DEFAULT_PORT;
  }
  if (args.length !== 2 || args[0] !== '--port' || !/^\d+$/u.test(args[1])) {
    throw new Error(
      'Uso: node scripts/snmp-lab.cjs [--port <puerto>] o --help.',
    );
  }
  return validatePort(Number(args[1]), false);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Laboratorio SNMPv2c local. Uso: node scripts/snmp-lab.cjs [--port <puerto>]\n' +
        'Escucha exclusivamente en 127.0.0.1 (puerto predeterminado: 1161).\n' +
        'Interfaz de laboratorio: 1. Los contadores miden octetos UDP del laboratorio;\n' +
        'no representan una tarjeta física ni un router. Ctrl+C detiene el agente.',
    );
    return;
  }
  const agent = await startAgent({ port: cliPort(args) });
  console.log(
    `Laboratorio SNMPv2c en ${ADDRESS}:${agent.port}; nombre TP6-LAB-PC.`,
  );
  console.log(
    'Interfaz 1: contadores acumulados del endpoint UDP de laboratorio.',
  );
  process.once('SIGINT', () => {
    agent.close().catch(() => {
      process.exitCode = 1;
    });
  });
}

module.exports = { startAgent };

if (require.main === module) {
  main().catch(() => {
    console.error(
      'No se pudo iniciar el laboratorio SNMP. Revise --help y la disponibilidad del puerto.',
    );
    process.exitCode = 1;
  });
}
