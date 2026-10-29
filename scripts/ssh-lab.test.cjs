const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('ssh2');
const {
  startLab,
  formatUptime,
  USERNAME,
  PASSWORD,
} = require('./ssh-lab.cjs');

// Conecta, ejecuta un comando y devuelve salida, error, código y huella vista.
function run(port, command, { password = PASSWORD, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let seen;
    client.on('error', reject);
    client.on('ready', () => {
      const done = (error, stream) => {
        if (error) {
          client.end();
          reject(error);
          return;
        }
        let stdout = '';
        let stderr = '';
        let code;
        stream.on('data', chunk => (stdout += chunk));
        stream.stderr.on('data', chunk => (stderr += chunk));
        stream.on('exit', value => (code = value));
        stream.on('close', () => {
          client.end();
          resolve({ stdout, stderr, code, fingerprint: seen });
        });
      };
      if (shell) client.shell(done);
      else client.exec(command, done);
    });
    client.connect({
      host: '127.0.0.1',
      port,
      username: USERNAME,
      password,
      readyTimeout: 3000,
      hostVerifier: key => {
        const digest = crypto.createHash('sha256').update(key).digest('base64');
        seen = `SHA256:${digest.replace(/[=]+$/u, '')}`;
        return true;
      },
    });
  });
}

test('responde uptime e interfaces simulados y expone su huella', async t => {
  const lab = await startLab({ port: 0 });
  t.after(() => lab.close());
  const uptime = await run(lab.port, 'uptime');
  assert.equal(uptime.code, 0);
  assert.match(uptime.stdout, / up \d+ min, {2}1 user, {2}load average: /u);
  assert.equal(uptime.fingerprint, lab.fingerprint);
  const interfaces = await run(lab.port, 'ip -brief address');
  assert.equal(interfaces.code, 0);
  assert.match(interfaces.stdout, /^eth0 +UP +192\.0\.2\.10\/24/mu);
  assert.deepEqual(lab.executed, ['uptime', 'ip -brief address']);
});

test('rechaza la contraseña incorrecta', async t => {
  const lab = await startLab({ port: 0 });
  t.after(() => lab.close());
  await assert.rejects(
    run(lab.port, 'uptime', { password: 'otra' }),
    /authentication/i,
  );
  assert.deepEqual(lab.executed, []);
});

test('no ejecuta comandos fuera de la lista ni abre una shell', async t => {
  const lab = await startLab({ port: 0 });
  t.after(() => lab.close());
  const other = await run(lab.port, 'cat /etc/passwd');
  assert.equal(other.code, 127);
  assert.equal(other.stdout, '');
  assert.match(other.stderr, /no permitido/u);
  await assert.rejects(run(lab.port, '', { shell: true }));
});

test('formatea el uptime como Linux', () => {
  const now = new Date(2026, 9, 29, 22, 45, 1);
  assert.match(formatUptime(125, now), /^ 22:45:01 up 2 min, /u);
  assert.match(formatUptime(3 * 3600 + 7 * 60, now), / up 3:07, /u);
  assert.match(formatUptime(86400 + 3600, now), / up 1 day, 1:00, /u);
  assert.match(formatUptime(3 * 86400, now), / up 3 days, 0:00, /u);
});

test('valida el puerto y cierra sin error dos veces', async () => {
  for (const port of [-1, 65536, 1.5, '2222']) {
    await assert.rejects(startLab({ port }), /puerto/i);
  }
  const lab = await startLab({ port: 0 });
  await lab.close();
  await lab.close();
});

test('la CLI muestra ayuda y rechaza opciones inválidas', () => {
  const script = path.join(__dirname, 'ssh-lab.cjs');
  const help = spawnSync(process.execPath, [script, '--help'], {
    encoding: 'utf8',
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /127\.0\.0\.1/u);
  assert.match(help.stdout, /no ejecuta comandos/u);
  for (const args of [
    ['--port', '0'],
    ['--port', 'abc'],
    ['--bind', '0.0.0.0'],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
  }
});
