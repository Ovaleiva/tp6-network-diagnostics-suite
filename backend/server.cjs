'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ADDRESS = '127.0.0.1';
const DEFAULT_PORT = 3000;
const DATA_DIR = path.join(__dirname, '..', 'tmp', 'backend');
const MAX_BODY = 20 * 1024 * 1024;
const KINDS = new Set(['installation.upsert', 'report.upload', 'diagnostic.upsert']);
const FILE_TYPES = new Set(['image/jpeg', 'application/pdf']);
const ID = /^[A-Za-z0-9:._-]{1,200}$/u;

// Fichas técnicas de ejemplo para RF-04 (identificación por código).
const TECHNICAL_SHEETS = {
  'TP6-ONT-001': {
    code: 'TP6-ONT-001',
    vendor: 'Laboratorio TP6',
    model: 'ONT GPON de ejemplo',
    instructions: 'Verificar potencia RX entre -8 y -27 dBm. Registrar número de serie y foto del rótulo.',
  },
  'TP6-RTR-002': {
    code: 'TP6-RTR-002',
    vendor: 'Laboratorio TP6',
    model: 'Router de borde de ejemplo',
    instructions: 'Consultar uptime e interfaces por SSH. Confirmar enlace WAN activo.',
  },
};

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function validatePort(port, allowEphemeral) {
  if (!Number.isInteger(port) || port < (allowEphemeral ? 0 : 1) || port > 65535) {
    throw new Error('El puerto debe ser un entero entre 1 y 65535 (0 solo en pruebas).');
  }
  return port;
}

// JSON con claves ordenadas: el mismo contenido da siempre el mismo hash.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function createStore(dataDir) {
  const empty = { actions: {}, entities: {}, files: {} };
  const stateFile = dataDir && path.join(dataDir, 'state.json');
  let state = empty;
  if (stateFile && fs.existsSync(stateFile)) {
    state = { ...empty, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
  }
  return {
    state,
    filePath: id => dataDir && path.join(dataDir, 'files', id),
    save() {
      if (!stateFile) return;
      fs.mkdirSync(dataDir, { recursive: true });
      // Escritura atómica: un corte no deja el estado a medias.
      fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 2));
      fs.renameSync(`${stateFile}.tmp`, stateFile);
    },
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'El cuerpo supera el máximo de 20 MB.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'El cuerpo no es JSON válido.'));
      }
    });
    request.on('error', reject);
  });
}

function handleAction(store, body) {
  const { actionId, kind, entityId, revision, entity } = body ?? {};
  if (
    typeof actionId !== 'string' || !ID.test(actionId) ||
    !KINDS.has(kind) ||
    typeof entityId !== 'string' || !ID.test(entityId) ||
    !Number.isInteger(revision) || revision < 1 ||
    !entity || typeof entity !== 'object' || entity.id !== entityId
  ) {
    throw new HttpError(422, 'Acción inválida: revise actionId, kind, entityId, revision y entity.');
  }
  const contentHash = sha256(canonical({ kind, entityId, revision, entity }));
  const previous = store.state.actions[actionId];
  // Idempotencia: el mismo id con el mismo contenido devuelve la misma confirmación.
  if (previous) {
    if (previous.contentHash !== contentHash) {
      throw new HttpError(422, 'El actionId ya se usó con otro contenido.');
    }
    return { status: 200, body: { actionId, status: 'applied', duplicate: true } };
  }
  const key = `${kind}:${entityId}`;
  const current = store.state.entities[key];
  const entityHash = sha256(canonical(entity));
  if (current && (current.revision > revision ||
      (current.revision === revision && current.entityHash !== entityHash))) {
    throw new HttpError(409, `El servidor ya tiene la revisión ${current.revision} de esta entidad.`, {
      currentRevision: current.revision,
    });
  }
  // Las fotos y el PDF deben haberse subido antes que la acción que los referencia.
  for (const fileId of referencedFiles(kind, entity)) {
    if (!store.state.files[fileId]) {
      throw new HttpError(422, `Falta subir el archivo ${fileId} antes de la acción.`);
    }
  }
  store.state.entities[key] = { revision, entityHash, entity, receivedAt: new Date().toISOString() };
  store.state.actions[actionId] = { kind, entityId, revision, contentHash, appliedAt: new Date().toISOString() };
  store.save();
  return { status: 200, body: { actionId, status: 'applied' } };
}

function referencedFiles(kind, entity) {
  if (kind === 'installation.upsert') {
    return (entity.photos ?? []).map(photo => photo.fileId).filter(Boolean);
  }
  if (kind === 'report.upload') return entity.fileId ? [entity.fileId] : [];
  return [];
}

function handleFile(store, body) {
  const { fileId, contentType, sha256: expected, dataBase64 } = body ?? {};
  if (
    typeof fileId !== 'string' || !ID.test(fileId) ||
    !FILE_TYPES.has(contentType) ||
    typeof expected !== 'string' || !/^[0-9a-f]{64}$/u.test(expected) ||
    typeof dataBase64 !== 'string'
  ) {
    throw new HttpError(422, 'Archivo inválido: revise fileId, contentType, sha256 y dataBase64.');
  }
  const data = Buffer.from(dataBase64, 'base64');
  if (sha256(data) !== expected) {
    throw new HttpError(422, 'El SHA-256 no coincide con el contenido recibido.');
  }
  const previous = store.state.files[fileId];
  if (previous) {
    if (previous.sha256 !== expected) {
      throw new HttpError(422, 'El fileId ya se usó con otro contenido.');
    }
    return { status: 200, body: { fileId, status: 'stored', duplicate: true } };
  }
  const target = store.filePath(fileId);
  if (target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  store.state.files[fileId] = { contentType, sha256: expected, size: data.length, storedAt: new Date().toISOString() };
  store.save();
  return { status: 200, body: { fileId, status: 'stored' } };
}

async function route(store, request) {
  const url = new URL(request.url, 'http://backend');
  if (request.method === 'GET' && url.pathname === '/health') {
    return { status: 200, body: { status: 'ok', time: new Date().toISOString() } };
  }
  const sheet = url.pathname.match(/^\/technical-sheets\/([^/]+)$/u);
  if (request.method === 'GET' && sheet) {
    const found = TECHNICAL_SHEETS[decodeURIComponent(sheet[1])];
    if (!found) throw new HttpError(404, 'No hay ficha técnica para ese código.');
    return { status: 200, body: found };
  }
  if (request.method === 'POST' && url.pathname === '/sync/actions') {
    return handleAction(store, await readBody(request));
  }
  if (request.method === 'POST' && url.pathname === '/sync/files') {
    return handleFile(store, await readBody(request));
  }
  throw new HttpError(404, 'Ruta inexistente.');
}

async function startBackend({ port = DEFAULT_PORT, dataDir, log = () => {} } = {}) {
  validatePort(port, true);
  const store = createStore(dataDir);
  const server = http.createServer(async (request, response) => {
    let result;
    try {
      result = await route(store, request);
    } catch (error) {
      result = error instanceof HttpError
        ? { status: error.status, body: { error: error.message, ...error.extra } }
        : { status: 500, body: { error: 'Error interno del backend de laboratorio.' } };
    }
    log(`${request.method} ${request.url} -> ${result.status}`);
    response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(result.body));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, ADDRESS, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  let closing;
  return {
    port: server.address().port,
    state: store.state,
    close() {
      if (!closing) {
        closing = new Promise(resolve => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        });
      }
      return closing;
    },
  };
}

function cliPort(args) {
  if (args.length === 0) return DEFAULT_PORT;
  if (args.length !== 2 || args[0] !== '--port' || !/^\d+$/u.test(args[1])) {
    throw new Error('Uso: node backend/server.cjs [--port <puerto>] o --help.');
  }
  return validatePort(Number(args[1]), false);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Backend de laboratorio TP6. Uso: node backend/server.cjs [--port <puerto>]\n' +
        'Escucha exclusivamente en 127.0.0.1 (puerto predeterminado: 3000).\n' +
        `Guarda acciones, entidades y archivos en ${DATA_DIR}.\n` +
        'Ctrl+C lo detiene; el estado se conserva entre ejecuciones.',
    );
    return;
  }
  const backend = await startBackend({
    port: cliPort(args),
    dataDir: DATA_DIR,
    log: line => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`),
  });
  console.log(`Backend de laboratorio en ${ADDRESS}:${backend.port}. Estado en ${DATA_DIR}.`);
  console.log('Desde el emulador: http://10.0.2.2:' + backend.port);
  process.once('SIGINT', () => {
    backend.close().catch(() => {
      process.exitCode = 1;
    });
  });
}

module.exports = { startBackend, canonical, TECHNICAL_SHEETS };

if (require.main === module) {
  main().catch(() => {
    console.error('No se pudo iniciar el backend. Revise --help y la disponibilidad del puerto.');
    process.exitCode = 1;
  });
}
