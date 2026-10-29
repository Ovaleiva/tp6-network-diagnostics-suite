import {
  decodeGetRequest,
  decodeResponse,
  encodeGetRequest,
  encodeResponse,
  oidsForInterface,
} from '../src/core/snmp/codec';

const oid = '1.3.6.1.2.1.1.5.0';
const expected = { requestId: 1, community: 'public', oids: [oid] };
const hex = (value: string) =>
  value.match(/../g)!.map(pair => parseInt(pair, 16));

// Independently specified BER vectors: version=1, community=public, request-id=1.
const request = hex(
  '302602010104067075626c6963a019020101020100020100300e300c06082b060102010105000500',
);
const response = hex(
  '302902010104067075626c6963a21c0201010201000201003011300f06082b0601020101050004034c4142',
);

describe('SNMPv2c BER codec', () => {
  it('matches independent request and response wire vectors', () => {
    expect(encodeGetRequest(1, 'public', [oid])).toEqual(request);
    expect(decodeGetRequest(request)).toEqual(expected);
    expect(decodeResponse(response, expected)).toEqual([
      { oid, type: 'string', value: 'LAB' },
    ]);
    expect(
      encodeResponse(1, 'public', [{ oid, type: 'string', value: 'LAB' }]),
    ).toEqual(response);
  });

  it('preserves the complete unsigned Counter32 range from a wire fixture', () => {
    const counter = hex(
      '302b02010104067075626c6963a21e0201010201000201003013301106082b06010201010500410500ffffffff',
    );
    expect(decodeResponse(counter, expected)[0].value).toBe(4294967295);
    for (const type of ['counter32', 'timeticks'] as const) {
      for (const value of [0, 127, 128, 2147483648, 4294967295]) {
        const bindings = [{ oid, type, value }];
        expect(
          decodeResponse(encodeResponse(1, 'public', bindings), expected),
        ).toEqual(bindings);
      }
    }
  });

  it('handles long BER lengths and a multibyte first OID subidentifier', () => {
    const unusualOid = '2.999.3.4294967295';
    expect(
      decodeGetRequest(encodeGetRequest(2147483647, 'public', [unusualOid])),
    ).toEqual({
      requestId: 2147483647,
      community: 'public',
      oids: [unusualOid],
    });
    const bindings = [{ oid, type: 'string' as const, value: 'x'.repeat(255) }];
    const packet = encodeResponse(1, 'public', bindings);
    expect(packet[1]).toBeGreaterThan(127);
    expect(decodeResponse(packet, expected)).toEqual(bindings);
  });

  it('decodes signed Integer32 values', () => {
    for (const value of [-2147483648, -129, -128, -1, 0, 2147483647]) {
      const bindings = [{ oid, type: 'integer' as const, value }];
      expect(
        decodeResponse(encodeResponse(1, 'public', bindings), expected),
      ).toEqual(bindings);
    }
  });

  it.each([
    ['version', 4, 0],
    ['PDU', 13, 0xa0],
    ['request-id', 17, 2],
    ['community', 7, 120],
    ['indefinite length', 1, 128],
    ['truncated length', 1, 100],
    ['invalid value tag', 38, 0x44],
  ])('rejects an invalid %s', (_label, index, value) => {
    const packet = [...response];
    packet[index as number] = value as number;
    expect(() => decodeResponse(packet, expected)).toThrow();
  });

  it('rejects truncation at every position, trailing data and invalid bytes', () => {
    for (let length = 0; length < response.length; length++) {
      expect(() =>
        decodeResponse(response.slice(0, length), expected),
      ).toThrow();
    }
    expect(() => decodeResponse([...response, 0], expected)).toThrow();
    expect(() =>
      decodeResponse([300, ...response.slice(1)], expected),
    ).toThrow();
    expect(() => decodeResponse(Array(8193).fill(0), expected)).toThrow();
  });

  it('rejects malformed OID subidentifiers and invalid unsigned integers', () => {
    const unfinishedOid = [...response];
    unfinishedOid[37] = 128;
    expect(() => decodeResponse(unfinishedOid, expected)).toThrow();
    const negativeCounter = encodeResponse(1, 'public', [
      { oid, type: 'integer', value: -1 },
    ]);
    negativeCounter[negativeCounter.length - 3] = 0x41;
    expect(() => decodeResponse(negativeCounter, expected)).toThrow();
    const oversizedCounter = encodeResponse(1, 'public', [
      { oid, type: 'counter32', value: 4294967295 },
    ]);
    oversizedCounter[oversizedCounter.length - 5] = 1;
    expect(() => decodeResponse(oversizedCounter, expected)).toThrow();
  });

  it('rejects Response PDUs as requests and non-NULL GetRequest values', () => {
    expect(() => decodeGetRequest(response)).toThrow();
    const nonNullRequest = [...response];
    nonNullRequest[13] = 0xa0;
    expect(() => decodeGetRequest(nonNullRequest)).toThrow();
    const duplicateRequest = encodeResponse(1, 'public', [
      { oid, type: 'noSuchObject', value: null },
      { oid, type: 'noSuchObject', value: null },
    ]);
    duplicateRequest[13] = 0xa0;
    duplicateRequest[duplicateRequest.length - 2] = 0x05;
    duplicateRequest[duplicateRequest.length - 18] = 0x05;
    expect(() => decodeGetRequest(duplicateRequest)).toThrow();
  });

  it('rejects duplicate, missing and unexpected response OIDs', () => {
    const binding = { oid, type: 'string' as const, value: 'LAB' };
    expect(() =>
      decodeResponse(encodeResponse(1, 'public', [binding, binding]), expected),
    ).toThrow();
    expect(() =>
      decodeResponse(encodeResponse(1, 'public', []), expected),
    ).toThrow();
    expect(() =>
      decodeResponse(
        encodeResponse(1, 'public', [{ ...binding, oid: '1.3.6.1.2.1.1.3.0' }]),
        expected,
      ),
    ).toThrow();
  });

  it('rejects SNMP error status and exception values', () => {
    expect(() =>
      decodeResponse(
        encodeResponse(1, 'public', [], { errorStatus: 5 }),
        expected,
      ),
    ).toThrow();
    for (const type of ['noSuchObject', 'noSuchInstance'] as const) {
      expect(() =>
        decodeResponse(
          encodeResponse(1, 'public', [{ oid, type, value: null }]),
          expected,
        ),
      ).toThrow();
    }
  });

  it('validates request bounds, ASCII and OID syntax', () => {
    for (const id of [0, -1, 2147483648, 1.5, NaN]) {
      expect(() => encodeGetRequest(id, 'public', [oid])).toThrow();
    }
    for (const community of ['', 'público', 'x'.repeat(256)]) {
      expect(() => encodeGetRequest(1, community, [oid])).toThrow();
    }
    for (const invalidOid of [
      '1.40.0',
      '3.0',
      '1.03.0',
      '1.3.-1',
      '1.3.4294967296',
    ]) {
      expect(() => encodeGetRequest(1, 'public', [invalidOid])).toThrow();
    }
    expect(() => encodeGetRequest(1, 'public', Array(33).fill(oid))).toThrow();
    expect(() => encodeGetRequest(1, 'public', [oid, oid])).toThrow();
    expect(() =>
      encodeResponse(1, 'public', [{ oid, type: 'string', value: 'á' }]),
    ).toThrow();
  });

  it('builds MIB-II OIDs only for an explicit positive interface index', () => {
    expect(oidsForInterface(7)).toEqual({
      sysName: oid,
      uptime: '1.3.6.1.2.1.1.3.0',
      inOctets: '1.3.6.1.2.1.2.2.1.10.7',
      outOctets: '1.3.6.1.2.1.2.2.1.16.7',
    });
    for (const index of [0, -1, 1.5, 2147483648]) {
      expect(() => oidsForInterface(index)).toThrow();
    }
  });
});
