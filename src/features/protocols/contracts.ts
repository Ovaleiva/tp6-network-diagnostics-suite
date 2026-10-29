import type { Device, Diagnostic } from '../../core/domain/models';

// Referencia al Keystore/Keychain; nunca la contraseña dentro del modelo Device.
export type CredentialReference = string;
export interface DiagnosticOptions {
  credentialReference: CredentialReference;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface SnmpService {
  readBasicStatus(
    device: Device,
    options: SnmpOptions,
  ): Promise<SnmpDiagnostic>;
  cancel(): void;
}

export interface SnmpOptions {
  community: string;
  port: number;
  interfaceIndex: number;
  timeoutMs: number;
}

export interface SnmpDiagnostic extends Diagnostic {
  snmp: {
    sysName: string;
    uptimeTicks: number;
    interfaceIndex: number;
    inOctets: number;
    outOctets: number;
  };
}

export type DiagnosticCommand = 'uptime' | 'interfaces';
export interface SshService {
  runDiagnostic(
    device: Device,
    command: DiagnosticCommand,
    options: DiagnosticOptions,
  ): Promise<Diagnostic>;
}
