const { test } = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { startAgent } = require('./snmp-lab.cjs');
const {
  encodeGetRequest,
  decodeResponse,
  oidsForInterface,
} = require('../src/core/snmp/codec');

function exchange(port, packet, timeoutMs = 300) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    function finish(error, value) {
      clearTimeout(timer);
      socket.close();
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }
    socket.once('error', finish);
    socket.once('message', bytes => finish(null, Array.from(bytes)));
    socket.send(Buffer.from(packet), port, '127.0.0.1', error => {
      if (error) {
        finish(error);
      }
    });
  });
}

test('loopback lab returns its name, uptime and controlled UDP octet counters', async t => {
  const agent = await startAgent({ port: 0 });
  t.after(() => agent.close());
  const oids = Object.values(oidsForInterface(1));
  const expected = { requestId: 41, community: 'public', oids };
  const packet = encodeGetRequest(41, 'public', oids);
  const firstWire = await exchange(agent.port, packet);
  const first = decodeResponse(firstWire, expected);
  assert.equal(first[0].value, 'TP6-LAB-PC');
  assert.equal(first[1].type, 'timeticks');
  assert.ok(first[1].value >= 0);
  assert.equal(first[2].value, packet.length);
  assert.equal(first[3].value, 0);
  const second = decodeResponse(await exchange(agent.port, packet), expected);
  assert.ok(second[1].value >= first[1].value);
  assert.equal(second[2].value, packet.length * 2);
  assert.equal(second[3].value, firstWire.length);
});

test('wrong community and malformed datagrams time out without stopping the agent', async t => {
  const agent = await startAgent({ port: 0 });
  t.after(() => agent.close());
  const oids = [oidsForInterface(1).sysName];
  await assert.rejects(
    exchange(agent.port, encodeGetRequest(1, 'wrong', oids), 80),
    /timeout/,
  );
  await assert.rejects(exchange(agent.port, [0x30, 0x80, 0], 80), /timeout/);
  const bytes = await exchange(agent.port, encodeGetRequest(1, 'public', oids));
  assert.equal(
    decodeResponse(bytes, { requestId: 1, community: 'public', oids })[0].value,
    'TP6-LAB-PC',
  );
});

test('unsupported objects and interface instances produce SNMPv2 exceptions', async t => {
  const agent = await startAgent({ port: 0 });
  t.after(() => agent.close());
  for (const [oid, tag] of [
    ['1.3.6.1.2.1.999.0', 0x80],
    [oidsForInterface(2).inOctets, 0x81],
  ]) {
    const oids = [oid];
    const bytes = await exchange(
      agent.port,
      encodeGetRequest(1, 'public', oids),
    );
    assert.deepEqual(bytes.slice(-2), [tag, 0]);
    assert.throws(
      () => decodeResponse(bytes, { requestId: 1, community: 'public', oids }),
      /no dispone/,
    );
  }
});

test('agent validates ports and closes idempotently', async () => {
  for (const port of [-1, 65536, 1.5, '1161']) {
    await assert.rejects(startAgent({ port }), /puerto/i);
  }
  const agent = await startAgent({ port: 0 });
  await agent.close();
  await agent.close();
});

test('CLI provides laboratory help and rejects unsafe or invalid options', () => {
  const script = path.join(__dirname, 'snmp-lab.cjs');
  const help = spawnSync(process.execPath, [script, '--help'], {
    encoding: 'utf8',
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /127\.0\.0\.1/);
  assert.match(help.stdout, /laboratorio/i);
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
