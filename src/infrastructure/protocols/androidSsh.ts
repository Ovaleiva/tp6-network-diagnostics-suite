import {
  SshError,
  type SshService,
} from '../../features/protocols/contracts';
import {
  buildSshDiagnostic,
  sshErrorFrom,
} from '../../features/protocols/sshDiagnostic';
import NativeSshClient from '../../specs/NativeSshClient';

function native() {
  if (!NativeSshClient) {
    throw new SshError(
      'unavailable',
      'El cliente SSH no está instalado. Compile e instale nuevamente la app Android.',
    );
  }
  return NativeSshClient;
}

function validateTarget(host: string, port: number, timeoutMs: number) {
  const parts = host.split('.');
  if (
    parts.length !== 4 ||
    parts.some(part => !/^\d{1,3}$/u.test(part) || Number(part) > 255)
  ) {
    throw new SshError('invalid', 'Ingrese una dirección IPv4 válida.');
  }
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 30000
  ) {
    throw new SshError(
      'invalid',
      'El puerto debe estar entre 1 y 65535 y el plazo entre 1000 y 30000 ms.',
    );
  }
}

// Los rechazos del módulo nativo se traducen a SshError con mensajes en español.
async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw sshErrorFrom(error);
  }
}

export const androidSsh: SshService = {
  async runDiagnostic(device, command, options) {
    const { profile, port, credentialReference, timeoutMs } = options;
    validateTarget(device.ip, port, timeoutMs);
    const client = native();
    const startedAt = new Date();
    const result = await call(() =>
      client.run(device.ip, port, credentialReference, profile, command, timeoutMs),
    );
    return buildSshDiagnostic(
      device,
      command,
      profile,
      port,
      result,
      startedAt,
      new Date(),
    );
  },
  cancel() {
    NativeSshClient?.cancel();
  },
  async scanHostKey(host, port, timeoutMs) {
    validateTarget(host, port, timeoutMs);
    const client = native();
    return call(() => client.scanHostKey(host, port, timeoutMs));
  },
  trustHostKey: (host, port, fingerprint) =>
    call(() => native().trustHostKey(host, port, fingerprint)),
  forgetHostKey: (host, port) => call(() => native().forgetHostKey(host, port)),
  saveCredential: (reference, username, password) =>
    call(() => native().saveCredential(reference, username, password)),
  credentialUser: reference => call(() => native().credentialUser(reference)),
  deleteCredential: reference => call(() => native().deleteCredential(reference)),
};
