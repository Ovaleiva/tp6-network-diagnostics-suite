export type Binding = {
  oid: string;
  type:
    | 'string'
    | 'timeticks'
    | 'counter32'
    | 'integer'
    | 'noSuchObject'
    | 'noSuchInstance';
  value: string | number | null;
};

export function encodeGetRequest(
  requestId: number,
  community: string,
  oids: readonly string[],
): number[];

export function decodeGetRequest(bytes: readonly number[]): {
  requestId: number;
  community: string;
  oids: string[];
};

export function encodeResponse(
  requestId: number,
  community: string,
  bindings: readonly Binding[],
  error?: { errorStatus?: number; errorIndex?: number },
): number[];

export function decodeResponse(
  bytes: readonly number[],
  expected: { requestId: number; community: string; oids: readonly string[] },
): Binding[];

export function oidsForInterface(index: number): {
  sysName: string;
  uptime: string;
  inOctets: string;
  outOctets: string;
};
