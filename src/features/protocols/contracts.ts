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
    options: DiagnosticOptions,
  ): Promise<Diagnostic>;
}

export type DiagnosticCommand = 'uptime' | 'interfaces';
export interface SshService {
  runDiagnostic(
    device: Device,
    command: DiagnosticCommand,
    options: DiagnosticOptions,
  ): Promise<Diagnostic>;
}
