import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type SshRunResult = {
  commandLine: string;
  exitStatus: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  hostKeyFingerprint: string;
};

export interface Spec extends TurboModule {
  // El comando se elige de la lista del módulo (perfil + comando), nunca texto libre.
  run(
    host: string,
    port: number,
    credentialReference: string,
    profile: string,
    command: string,
    timeoutMs: number,
  ): Promise<SshRunResult>;
  cancel(): void;
  scanHostKey(host: string, port: number, timeoutMs: number): Promise<string>;
  trustHostKey(host: string, port: number, fingerprint: string): Promise<void>;
  forgetHostKey(host: string, port: number): Promise<void>;
  saveCredential(
    reference: string,
    username: string,
    password: string,
  ): Promise<void>;
  credentialUser(reference: string): Promise<string | null>;
  deleteCredential(reference: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('NativeSshClient');
