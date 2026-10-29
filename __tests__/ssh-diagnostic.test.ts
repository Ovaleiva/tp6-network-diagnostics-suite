import type { Device } from '../src/core/domain/models';
import { SshError } from '../src/features/protocols/contracts';
import {
  MAX_STORED_OUTPUT,
  buildSshDiagnostic,
  credentialReference,
  formatDuration,
  parseIpBrief,
  parseLinuxUptime,
  sshErrorFrom,
  type NativeRunResult,
} from '../src/features/protocols/sshDiagnostic';

const device: Device = {
  id: 'manual:10.0.2.2',
  siteId: 'sitio-local',
  ip: '10.0.2.2',
  discoveryMethod: 'manual',
  discoveredAt: '2026-10-29T12:00:00.000Z',
};

function result(overrides: Partial<NativeRunResult> = {}): NativeRunResult {
  return {
    commandLine: 'uptime',
    exitStatus: 0,
    stdout: ' 22:45:01 up 3 days, 4:05,  1 user,  load average: 0.08, 0.03, 0.01\n',
    stderr: '',
    truncated: false,
    hostKeyFingerprint: 'SHA256:abc',
    ...overrides,
  };
}

describe('interpretación de salidas Linux', () => {
  it.each([
    [' 10:00:00 up 12 min,  1 user,  load average: 0.00', 12 * 60],
    [' 10:00:00 up 4:05,  2 users,  load average: 0.00', 4 * 3600 + 5 * 60],
    [' 10:00:00 up 3 days, 4:05,  1 user', 3 * 86400 + 4 * 3600 + 5 * 60],
    [' 10:00:00 up 1 day, 7 min,  1 user', 86400 + 7 * 60],
  ])('uptime "%s"', (output, seconds) => {
    expect(parseLinuxUptime(output)).toBe(seconds);
  });

  it('devuelve undefined si el uptime no tiene el formato esperado', () => {
    expect(parseLinuxUptime('sin datos')).toBeUndefined();
  });

  it('lee nombre, estado y direcciones de ip -brief address', () => {
    const output =
      'lo               UNKNOWN        127.0.0.1/8 ::1/128\n' +
      'eth0             UP             192.0.2.10/24\n' +
      'wlan0            DOWN           \n';
    expect(parseIpBrief(output)).toEqual([
      { name: 'lo', state: 'UNKNOWN', addresses: ['127.0.0.1/8', '::1/128'] },
      { name: 'eth0', state: 'UP', addresses: ['192.0.2.10/24'] },
      { name: 'wlan0', state: 'DOWN', addresses: [] },
    ]);
  });

  it('formatea duraciones', () => {
    expect(formatDuration(3 * 86400 + 4 * 3600 + 5 * 60)).toBe('3 d 4 h 5 min');
    expect(formatDuration(59)).toBe('0 min');
  });
});

describe('diagnóstico SSH', () => {
  const started = new Date('2026-10-29T12:00:00.000Z');
  const finished = new Date('2026-10-29T12:00:01.000Z');

  it('una credencial por equipo y puerto', () => {
    expect(credentialReference('10.0.2.2', 2222)).toBe('ssh:10.0.2.2:2222');
  });

  it('arma un diagnóstico exitoso con el uptime interpretado', () => {
    const diagnostic = buildSshDiagnostic(device, 'uptime', 'linux', 2222, result(), started, finished);
    expect(diagnostic).toMatchObject({
      deviceId: 'manual:10.0.2.2',
      siteId: 'sitio-local',
      protocol: 'ssh',
      status: 'success',
      startedAt: started.toISOString(),
      ssh: {
        command: 'uptime',
        commandLine: 'uptime',
        port: 2222,
        exitStatus: 0,
        uptimeSeconds: 3 * 86400 + 4 * 3600 + 5 * 60,
        hostKeyFingerprint: 'SHA256:abc',
      },
    });
    expect(diagnostic.id).toMatch(/^ssh-/u);
  });

  it('interpreta interfaces solo en el perfil Linux', () => {
    const output = 'eth0 UP 192.0.2.10/24\n';
    const linux = buildSshDiagnostic(device, 'interfaces', 'linux', 22, result({ stdout: output }), started, finished);
    const cisco = buildSshDiagnostic(device, 'interfaces', 'cisco-ios', 22, result({ stdout: output }), started, finished);
    expect(linux.ssh.interfaces).toHaveLength(1);
    expect(cisco.ssh.interfaces).toBeUndefined();
    expect(cisco.ssh.output).toBe(output);
  });

  it('marca error si el comando termina con código distinto de cero', () => {
    const diagnostic = buildSshDiagnostic(
      device,
      'uptime',
      'linux',
      22,
      result({ exitStatus: 127, stdout: '', stderr: 'comando no encontrado\n' }),
      started,
      finished,
    );
    expect(diagnostic.status).toBe('error');
    expect(diagnostic.ssh.output).toBe('comando no encontrado\n');
    expect(diagnostic.ssh.uptimeSeconds).toBeUndefined();
  });

  it('recorta la salida guardada', () => {
    const diagnostic = buildSshDiagnostic(
      device,
      'interfaces',
      'routeros',
      22,
      result({ stdout: 'x'.repeat(MAX_STORED_OUTPUT + 10) }),
      started,
      finished,
    );
    expect(diagnostic.ssh.output).toHaveLength(MAX_STORED_OUTPUT);
    expect(diagnostic.ssh.outputTruncated).toBe(true);
  });
});

describe('errores del módulo nativo', () => {
  it.each([
    ['E_HOST_KEY_UNKNOWN', 'host-key-unknown'],
    ['E_HOST_KEY_CHANGED', 'host-key-changed'],
    ['E_AUTH', 'auth'],
    ['E_NO_CREDENTIAL', 'no-credential'],
    ['E_TIMEOUT', 'timeout'],
    ['E_UNREACHABLE', 'unreachable'],
    ['E_CANCELLED', 'cancelled'],
    ['E_INVALID_ARGUMENT', 'invalid'],
    ['E_RARO', 'ssh'],
  ])('%s se traduce a %s', (code, expected) => {
    const error = sshErrorFrom({ code, message: 'detalle nativo' });
    expect(error).toBeInstanceOf(SshError);
    expect(error.code).toBe(expected);
  });

  it('avisa que no se envió la contraseña si cambió la huella', () => {
    expect(sshErrorFrom({ code: 'E_HOST_KEY_CHANGED' }).message).toMatch(/no se envió la contraseña/u);
  });

  it('conserva el mensaje nativo para errores sin traducción', () => {
    expect(sshErrorFrom({ code: 'E_RARO', message: 'Error SSH: x' }).message).toBe('Error SSH: x');
  });
});
