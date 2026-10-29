import type { Device, Diagnostic } from '../../core/domain/models';

// Referencia a la credencial cifrada en el Keystore; nunca la contraseña en el modelo.
export type CredentialReference = string;

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
// Cada perfil traduce los comandos a la sintaxis de su sistema (lista en el módulo nativo).
export type SshProfile = 'linux' | 'cisco-ios' | 'routeros';

export interface SshOptions {
  profile: SshProfile;
  port: number;
  credentialReference: CredentialReference;
  timeoutMs: number;
}

export interface SshInterface {
  name: string;
  state: string;
  addresses: string[];
}

export interface SshDiagnostic extends Diagnostic {
  ssh: {
    profile: SshProfile;
    command: DiagnosticCommand;
    commandLine: string;
    port: number;
    exitStatus: number;
    output: string;
    outputTruncated: boolean;
    hostKeyFingerprint: string;
    // Datos interpretados cuando el perfil tiene un formato conocido (Linux).
    uptimeSeconds?: number;
    interfaces?: SshInterface[];
  };
}

export type SshErrorCode =
  | 'host-key-unknown'
  | 'host-key-changed'
  | 'auth'
  | 'no-credential'
  | 'timeout'
  | 'unreachable'
  | 'cancelled'
  | 'invalid'
  | 'unavailable'
  | 'ssh';

export class SshError extends Error {
  constructor(public code: SshErrorCode, message: string) {
    super(message);
    this.name = 'SshError';
  }
}

export interface SshService {
  // Falla con SshError('host-key-unknown') si la huella del equipo no se confirmó.
  runDiagnostic(
    device: Device,
    command: DiagnosticCommand,
    options: SshOptions,
  ): Promise<SshDiagnostic>;
  cancel(): void;
  // Huella del equipo sin autenticarse, para que el técnico la compare.
  scanHostKey(host: string, port: number, timeoutMs: number): Promise<string>;
  trustHostKey(host: string, port: number, fingerprint: string): Promise<void>;
  forgetHostKey(host: string, port: number): Promise<void>;
  // La contraseña se cifra en el módulo nativo y no vuelve a JavaScript.
  saveCredential(
    reference: CredentialReference,
    username: string,
    password: string,
  ): Promise<void>;
  credentialUser(reference: CredentialReference): Promise<string | null>;
  deleteCredential(reference: CredentialReference): Promise<void>;
}
