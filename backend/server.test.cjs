const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { startBackend, canonical } = require('./server.cjs');

async function call(backend, method, route, body) {
  const response = await fetch(`http://127.0.0.1:${backend.port}${route}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function action(overrides = {}) {
  return {
    actionId: 'act-1',
    kind: 'diagnostic.upsert',
    entityId: 'diag-1',
    revision: 1,
    entity: { id: 'diag-1', protocol: 'snmp', summary: 'ok' },
    ...overrides,
  };
}

function file(fileId, data, contentType = 'image/jpeg') {
  return {
    fileId,
    contentType,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    dataBase64: Buffer.from(data).toString('base64'),
  };
}

async function start(t, options = {}) {
  const backend = await startBackend({ port: 0, ...options });
  t.after(() => backend.close());
  return backend;
}

test('health responde sin depender de los datos', async t => {
  const backend = await start(t);
  const { status, body } = await call(backend, 'GET', '/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
});

test('aplica una acción y repetirla no duplica', async t => {
  const backend = await start(t);
  assert.deepEqual((await call(backend, 'POST', '/sync/actions', action())).body, {
    actionId: 'act-1',
    status: 'applied',
  });
  const again = await call(backend, 'POST', '/sync/actions', action());
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(Object.keys(backend.state.actions).length, 1);
});

test('rechaza un actionId repetido con otro contenido', async t => {
  const backend = await start(t);
  await call(backend, 'POST', '/sync/actions', action());
  const changed = await call(backend, 'POST', '/sync/actions', action({
    entity: { id: 'diag-1', protocol: 'snmp', summary: 'otro' },
  }));
  assert.equal(changed.status, 422);
});

test('devuelve 409 ante una revisión vieja o distinta con el mismo número', async t => {
  const backend = await start(t);
  const installation = { id: 'inst-1', siteId: 's', notes: 'v2', photos: [] };
  await call(backend, 'POST', '/sync/actions', action({
    actionId: 'a2', kind: 'installation.upsert', entityId: 'inst-1', revision: 2, entity: installation,
  }));
  const old = await call(backend, 'POST', '/sync/actions', action({
    actionId: 'a1', kind: 'installation.upsert', entityId: 'inst-1', revision: 1, entity: { ...installation, notes: 'v1' },
  }));
  assert.equal(old.status, 409);
  assert.equal(old.body.currentRevision, 2);
  const sameRevision = await call(backend, 'POST', '/sync/actions', action({
    actionId: 'a3', kind: 'installation.upsert', entityId: 'inst-1', revision: 2, entity: { ...installation, notes: 'otra' },
  }));
  assert.equal(sameRevision.status, 409);
  // Misma revisión y mismo contenido desde otra acción: no es conflicto.
  const identical = await call(backend, 'POST', '/sync/actions', action({
    actionId: 'a4', kind: 'installation.upsert', entityId: 'inst-1', revision: 2, entity: installation,
  }));
  assert.equal(identical.status, 200);
  const newer = await call(backend, 'POST', '/sync/actions', action({
    actionId: 'a5', kind: 'installation.upsert', entityId: 'inst-1', revision: 3, entity: { ...installation, notes: 'v3' },
  }));
  assert.equal(newer.status, 200);
});

test('exige subir los archivos antes de la acción que los usa', async t => {
  const backend = await start(t);
  const installation = {
    id: 'inst-1', siteId: 's', notes: '', photos: [{ id: 'p1', fileId: 'p1', capturedAt: 'x' }],
  };
  const body = action({ kind: 'installation.upsert', entityId: 'inst-1', entity: installation });
  assert.equal((await call(backend, 'POST', '/sync/actions', body)).status, 422);
  assert.equal((await call(backend, 'POST', '/sync/files', file('p1', 'jpeg'))).status, 200);
  assert.equal((await call(backend, 'POST', '/sync/actions', body)).status, 200);
});

test('verifica el SHA-256 de los archivos y los guarda una sola vez', async t => {
  const backend = await start(t);
  const bad = { ...file('p1', 'jpeg'), dataBase64: Buffer.from('otro').toString('base64') };
  assert.equal((await call(backend, 'POST', '/sync/files', bad)).status, 422);
  assert.equal((await call(backend, 'POST', '/sync/files', file('p1', 'jpeg'))).status, 200);
  const again = await call(backend, 'POST', '/sync/files', file('p1', 'jpeg'));
  assert.equal(again.body.duplicate, true);
  assert.equal((await call(backend, 'POST', '/sync/files', file('p1', 'distinto'))).status, 422);
  assert.equal((await call(backend, 'POST', '/sync/files', file('x', 'a', 'text/plain'))).status, 422);
});

test('valida acciones y JSON', async t => {
  const backend = await start(t);
  assert.equal((await call(backend, 'POST', '/sync/actions', '{roto')).status, 400);
  for (const invalid of [
    action({ kind: 'otro' }),
    action({ revision: 0 }),
    action({ entity: { id: 'otra' } }),
    action({ actionId: 'con espacios' }),
  ]) {
    assert.equal((await call(backend, 'POST', '/sync/actions', invalid)).status, 422);
  }
  assert.equal((await call(backend, 'GET', '/no-existe')).status, 404);
});

test('conserva el estado entre reinicios', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp6-backend-'));
  try {
    const first = await startBackend({ port: 0, dataDir });
    await call(first, 'POST', '/sync/files', file('p1', 'jpeg'));
    await call(first, 'POST', '/sync/actions', action());
    await first.close();
    assert.equal(fs.readFileSync(path.join(dataDir, 'files', 'p1'), 'utf8'), 'jpeg');
    const second = await startBackend({ port: 0, dataDir });
    const again = await call(second, 'POST', '/sync/actions', action());
    assert.equal(again.body.duplicate, true);
    await second.close();
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('entrega fichas técnicas de ejemplo y 404 si no existe', async t => {
  const backend = await start(t);
  const found = await call(backend, 'GET', '/technical-sheets/TP6-ONT-001');
  assert.equal(found.status, 200);
  assert.equal(found.body.code, 'TP6-ONT-001');
  assert.equal((await call(backend, 'GET', '/technical-sheets/NADA')).status, 404);
});

test('el JSON canónico no depende del orden de las claves', () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test('la CLI muestra ayuda y rechaza opciones inválidas', () => {
  const script = path.join(__dirname, 'server.cjs');
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /127\.0\.0\.1/u);
  for (const args of [['--port', '0'], ['--bind', '0.0.0.0']]) {
    assert.equal(spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }).status, 1);
  }
});
