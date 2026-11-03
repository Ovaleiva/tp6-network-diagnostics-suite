import { Platform } from 'react-native';
import NativeTcpProbe from '../../specs/NativeTcpProbe';
import { PROBE_PORTS } from '../../features/discovery/rangeScan';

export const PROBE_TIMEOUT_MS = 700;

function nativeModule() {
  if (Platform.OS !== 'android' || !NativeTcpProbe) {
    throw new Error('El barrido de rango requiere la build Android con la sonda TCP.');
  }
  return NativeTcpProbe;
}

export const androidTcpProbe = {
  // Puertos que aceptaron la conexión; [] si ninguno respondió a tiempo.
  probe(host: string): Promise<number[]> {
    return nativeModule().probe(host, [...PROBE_PORTS], PROBE_TIMEOUT_MS);
  },
  cancel() {
    NativeTcpProbe?.cancel();
  },
};
