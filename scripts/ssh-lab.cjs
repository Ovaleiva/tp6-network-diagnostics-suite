'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { Server, utils } = require('ssh2');

const ADDRESS = '127.0.0.1';
const DEFAULT_PORT = 2222;
const USERNAME = 'tecnico';
const PASSWORD = 'laboratorio';
const HOST_KEY_PATH = path.join(__dirname, '..', 'tmp', 'ssh-lab', 'host_rsa_key');

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

function generateHostKey() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  }).privateKey;
}

// La clave se conserva entre ejecuciones para que la huella no cambie.
function loadHostKey(file) {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generateHostKey(), { mode: 0o600 });
  }
  return fs.readFileSync(file, 'utf8');
}

// Huella en el formato de OpenSSH: SHA256 del blob público, base64 sin relleno.
function fingerprint(hostKey) {
  const blob = utils.parseKey(hostKey).getPublicSSH();
  const digest = crypto.createHash('sha256').update(blob).digest('base64');
  return `SHA256:${digest.replace(/[=]+$/u, '')}`;
}

function formatUptime(seconds, now = new Date()) {
  const clock = now.toTimeString().slice(0, 8);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const hhmm = `${hours % 24}:${String(minutes % 60).padStart(2, '0')}`;
  const up =
    days > 0
      ? `${days} day${days === 1 ? '' : 's'}, ${hhmm}`
      : hours > 0
      ? hhmm
      : `${minutes} min`;
  return ` ${clock} up ${up},  1 user,  load average: 0.08, 0.03, 0.01\n`;
}

// Salidas simuladas: el laboratorio no ejecuta comandos en la PC.
const INTERFACES =
  'lo               UNKNOWN        127.0.0.1/8 ::1/128\n' +
  'eth0             UP             192.0.2.10/24 fe80::5054:ff:fe12:3456/64\n' +
  'wlan0            DOWN           \n';

async function startLab({ port = DEFAULT_PORT, hostKey } = {}) {
  validatePort(port, true);
  const key = hostKey ?? generateHostKey();
  const started = performance.now();
  const expected = Buffer.from(PASSWORD);
  const commands = new Map([
    ['uptime', () => formatUptime((performance.now() - started) / 1000)],
    ['ip -brief address', () => INTERFACES],
  ]);
  const clients = new Set();
  const executed = [];

  const server = new Server({ hostKeys: [key] }, client => {
    clients.add(client);
    client.on('close', () => clients.delete(client));
    client.on('error', () => {});
    client.on('authentication', ctx => {
      const given = Buffer.from(ctx.method === 'password' ? ctx.password : '');
      const valid =
        ctx.method === 'password' &&
        ctx.username === USERNAME &&
        given.length === expected.length &&
        crypto.timingSafeEqual(given, expected);
      if (valid) ctx.accept();
      else ctx.reject(['password']);
    });
    client.on('ready', () => {
      client.on('session', accept => {
        const session = accept();
        // Solo exec: no hay shell, terminal, subsistemas ni reenvíos.
        session.on('pty', (_accept, reject) => reject?.());
        session.on('shell', (_accept, reject) => reject?.());
        session.on('subsystem', (_accept, reject) => reject?.());
        session.on('exec', (acceptExec, _reject, info) => {
          const stream = acceptExec();
          const run = commands.get(info.command);
          executed.push(info.command);
          if (run) {
            stream.write(run());
            stream.exit(0);
          } else {
            stream.stderr.write(`tp6-lab: comando no permitido: ${info.command}\n`);
            stream.exit(127);
          }
          stream.end();
        });
      });
      client.on('request', (_accept, reject) => reject?.());
      client.on('tcpip', (_accept, reject) => reject?.());
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, ADDRESS, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  server.on('error', () => {
    console.error('Laboratorio SSH: error del servidor.');
  });

  let closing;
  return {
    port: server.address().port,
    fingerprint: fingerprint(key),
    executed,
    close() {
      if (!closing) {
        closing = new Promise(resolve => {
          for (const client of clients) client.end();
          server.close(() => resolve());
        });
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
    throw new Error('Uso: node scripts/ssh-lab.cjs [--port <puerto>] o --help.');
  }
  return validatePort(Number(args[1]), false);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Laboratorio SSH local. Uso: node scripts/ssh-lab.cjs [--port <puerto>]\n' +
        'Escucha exclusivamente en 127.0.0.1 (puerto predeterminado: 2222).\n' +
        `Usuario ${USERNAME}, contraseña ${PASSWORD}. Solo responde "uptime" e\n` +
        '"ip -brief address" con salidas simuladas; no ejecuta comandos en la PC.\n' +
        'Ctrl+C detiene el servidor.',
    );
    return;
  }
  const port = cliPort(args);
  const lab = await startLab({ port, hostKey: loadHostKey(HOST_KEY_PATH) });
  console.log(`Laboratorio SSH en ${ADDRESS}:${lab.port}; usuario ${USERNAME}.`);
  console.log(`Huella del servidor: ${lab.fingerprint}`);
  console.log('Compárela con la que muestra la app en la primera conexión.');
  process.once('SIGINT', () => {
    lab.close().catch(() => {
      process.exitCode = 1;
    });
  });
}

module.exports = { startLab, fingerprint, formatUptime, USERNAME, PASSWORD };

if (require.main === module) {
  main().catch(() => {
    console.error(
      'No se pudo iniciar el laboratorio SSH. Revise --help y la disponibilidad del puerto.',
    );
    process.exitCode = 1;
  });
}
