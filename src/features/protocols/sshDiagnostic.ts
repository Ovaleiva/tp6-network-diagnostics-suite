import type { Device } from '../../core/domain/models';
import { newId } from '../../core/ids';
import {
  SshError,
  type CredentialReference,
  type DiagnosticCommand,
  type SshDiagnostic,
  type SshErrorCode,
  type SshInterface,
  type SshProfile,
} from './contracts';

export const SSH_PROFILES: { id: SshProfile; label: string; tested: boolean }[] = [
  { id: 'linux', label: 'Linux', tested: true },
  { id: 'cisco-ios', label: 'Cisco IOS', tested: false },
  { id: 'routeros', label: 'MikroTik RouterOS', tested: false },
];

// Lo guardado en la base se recorta: el diagnóstico no es un volcado completo.
export const MAX_STORED_OUTPUT = 8000;

// Una credencial por equipo y puerto.
export function credentialReference(ip: string, port: number): CredentialReference {
  return `ssh:${ip}:${port}`;
}

// Interpreta "up 3 days, 4:05", "up 4:05", "up 12 min" y "up 2 days, 7 min".
export function parseLinuxUptime(output: string): number | undefined {
  const match = output.match(
    /\bup\s+(?:(\d+)\s+days?,\s*)?(?:(\d+):(\d{2})|(\d+)\s+min)/u,
  );
  if (!match) return undefined;
  const [, days, hours, minutes, onlyMinutes] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? onlyMinutes ?? 0) * 60
  );
}

// Salida de "ip -brief address": nombre, estado y direcciones por renglón.
export function parseIpBrief(output: string): SshInterface[] {
  return output
    .split(/\r?\n/u)
    .map(line => line.trim().split(/\s+/u))
    .filter(parts => parts.length >= 2 && parts[0])
    .map(([name, state, ...addresses]) => ({ name, state, addresses }));
}

export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [
    days ? `${days} d` : '',
    hours ? `${hours} h` : '',
    `${minutes} min`,
  ];
  return parts.filter(Boolean).join(' ');
}

export interface NativeRunResult {
  commandLine: string;
  exitStatus: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  hostKeyFingerprint: string;
}

export function buildSshDiagnostic(
  device: Device,
  command: DiagnosticCommand,
  profile: SshProfile,
  port: number,
  result: NativeRunResult,
  startedAt: Date,
  finishedAt: Date,
): SshDiagnostic {
  const ok = result.exitStatus === 0;
  const raw = ok ? result.stdout : `${result.stdout}${result.stderr}`;
  const output = raw.slice(0, MAX_STORED_OUTPUT);
  const parsed: Partial<SshDiagnostic['ssh']> = {};
  if (ok && profile === 'linux') {
    if (command === 'uptime') parsed.uptimeSeconds = parseLinuxUptime(result.stdout);
    else parsed.interfaces = parseIpBrief(result.stdout);
  }
  return {
    id: newId('ssh', startedAt.getTime()),
    deviceId: device.id,
    siteId: device.siteId,
    protocol: 'ssh',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    status: ok ? 'success' : 'error',
    summary: ok
      ? `Comando "${result.commandLine}" ejecutado por SSH.`
      : `El comando "${result.commandLine}" terminó con código ${result.exitStatus}.`,
    ssh: {
      profile,
      command,
      commandLine: result.commandLine,
      port,
      exitStatus: result.exitStatus,
      output,
      outputTruncated: result.truncated || raw.length > MAX_STORED_OUTPUT,
      hostKeyFingerprint: result.hostKeyFingerprint,
      ...parsed,
    },
  };
}

const NATIVE_CODES: Record<string, SshErrorCode> = {
  E_HOST_KEY_UNKNOWN: 'host-key-unknown',
  E_HOST_KEY_CHANGED: 'host-key-changed',
  E_AUTH: 'auth',
  E_NO_CREDENTIAL: 'no-credential',
  E_TIMEOUT: 'timeout',
  E_UNREACHABLE: 'unreachable',
  E_CANCELLED: 'cancelled',
  E_INVALID_ARGUMENT: 'invalid',
};

const MESSAGES: Partial<Record<SshErrorCode, string>> = {
  'host-key-unknown':
    'Primera conexión con este equipo: confirme su huella antes de enviar la contraseña.',
  'host-key-changed':
    'La huella del equipo no coincide con la confirmada. Puede ser otro equipo o un intermediario: no se envió la contraseña.',
  auth: 'Usuario o contraseña incorrectos.',
  'no-credential': 'No hay una credencial guardada para este equipo y puerto.',
  timeout: 'El equipo no respondió dentro del plazo de espera.',
  unreachable: 'No se pudo conectar: puerto cerrado o equipo inaccesible.',
  cancelled: 'La conexión SSH fue cancelada.',
};

// Traduce el rechazo del módulo nativo ({ code, message }) a un SshError.
export function sshErrorFrom(error: unknown): SshError {
  if (error instanceof SshError) return error;
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  const mapped = (code && NATIVE_CODES[code]) || 'ssh';
  return new SshError(
    mapped,
    MESSAGES[mapped] ?? message ?? 'La conexión SSH falló.',
  );
}
