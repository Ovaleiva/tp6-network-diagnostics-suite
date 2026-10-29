import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SshError } from '../src/features/protocols/contracts';
import { SshScreen } from '../src/features/protocols/SshScreen';

const PASSWORD = 'clave-secreta-de-prueba';

let app: ReactTestRenderer.ReactTestRenderer;
let ssh: Record<string, jest.Mock>;
let repository: { saveDiagnosticWithAction: jest.Mock };
let savedUser: string | null;

function diagnostic(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ssh-1',
    deviceId: 'manual:10.0.2.2',
    siteId: 'sitio-local',
    protocol: 'ssh',
    startedAt: '2026-10-29T12:00:00.000Z',
    finishedAt: '2026-10-29T12:00:01.000Z',
    status: 'success',
    summary: 'ok',
    ssh: {
      profile: 'linux',
      command: 'uptime',
      commandLine: 'uptime',
      port: 2222,
      exitStatus: 0,
      output: ' 10:00:00 up 12 min,  1 user\n',
      outputTruncated: false,
      hostKeyFingerprint: 'SHA256:huella',
      uptimeSeconds: 720,
    },
    ...overrides,
  };
}

async function render(user: string | null = 'tecnico') {
  savedUser = user;
  ssh = {
    runDiagnostic: jest.fn().mockResolvedValue(diagnostic()),
    cancel: jest.fn(),
    scanHostKey: jest.fn().mockResolvedValue('SHA256:huella'),
    trustHostKey: jest.fn().mockResolvedValue(undefined),
    forgetHostKey: jest.fn().mockResolvedValue(undefined),
    saveCredential: jest.fn(async (_ref: string, username: string) => {
      savedUser = username;
    }),
    credentialUser: jest.fn(async () => savedUser),
    deleteCredential: jest.fn(async () => {
      savedUser = null;
    }),
  };
  repository = { saveDiagnosticWithAction: jest.fn().mockResolvedValue(undefined) };
  await act(async () => {
    app = ReactTestRenderer.create(
      <SshScreen
        navigation={{} as never}
        route={{ key: 'ssh', name: 'SshDiagnostics', params: undefined }}
        ssh={ssh as never}
        repository={repository as never}
      />,
    );
  });
}

afterEach(async () => {
  await act(async () => app.unmount());
});

function node(label: string) {
  return app.root.find(
    item =>
      item.props.accessibilityLabel === label &&
      (typeof item.props.onPress === 'function' ||
        typeof item.props.onChangeText === 'function'),
  );
}

async function press(label: string) {
  await act(async () => {
    await node(label).props.onPress();
  });
}

function text() {
  return JSON.stringify(app.toJSON());
}

test('usa el laboratorio por defecto y muestra la credencial guardada', async () => {
  await render();
  expect(node('Dirección IPv4').props.value).toBe('10.0.2.2');
  expect(node('Puerto SSH').props.value).toBe('2222');
  expect(ssh.credentialUser).toHaveBeenCalledWith('ssh:10.0.2.2:2222');
  expect(text()).toContain('Guardada para el usuario ');
});

test('guarda la credencial en el Keystore y borra la contraseña del formulario', async () => {
  await render(null);
  await act(async () => {
    node('Usuario').props.onChangeText('tecnico');
    node('Contraseña').props.onChangeText(PASSWORD);
  });
  expect(node('Contraseña').props.secureTextEntry).toBe(true);
  await press('Guardar en el Keystore');
  expect(ssh.saveCredential).toHaveBeenCalledWith('ssh:10.0.2.2:2222', 'tecnico', PASSWORD);
  expect(text()).not.toContain(PASSWORD);
  expect(text()).toContain('Credencial cifrada en el Keystore');
});

test('ejecuta uptime, muestra el resultado y lo guarda sin la contraseña', async () => {
  await render();
  await press('Ejecutar uptime');
  expect(ssh.runDiagnostic).toHaveBeenCalledWith(
    expect.objectContaining({ ip: '10.0.2.2', id: 'manual:10.0.2.2' }),
    'uptime',
    { profile: 'linux', port: 2222, credentialReference: 'ssh:10.0.2.2:2222', timeoutMs: 8000 },
  );
  expect(text()).toContain('Encendido hace ');
  const [saved, action] = repository.saveDiagnosticWithAction.mock.calls[0];
  expect(action).toMatchObject({ kind: 'diagnostic.upsert', entityId: 'ssh-1' });
  expect(JSON.stringify(saved)).not.toContain(PASSWORD);
  expect(text()).toContain('Queda en cola para sincronizar');
});

test('no guarda comandos que terminaron con error', async () => {
  await render();
  ssh.runDiagnostic.mockResolvedValue(diagnostic({ status: 'error' }));
  await press('Ejecutar interfaces');
  expect(repository.saveDiagnosticWithAction).not.toHaveBeenCalled();
});

test('en la primera conexión pide confirmar la huella antes de ejecutar', async () => {
  await render();
  ssh.runDiagnostic
    .mockRejectedValueOnce(new SshError('host-key-unknown', 'confirme'))
    .mockResolvedValueOnce(diagnostic());
  await press('Ejecutar uptime');
  expect(ssh.scanHostKey).toHaveBeenCalledWith('10.0.2.2', 2222, 8000);
  expect(text()).toContain('SHA256:huella');
  expect(ssh.trustHostKey).not.toHaveBeenCalled();
  await press('Confiar y ejecutar');
  expect(ssh.trustHostKey).toHaveBeenCalledWith('10.0.2.2', 2222, 'SHA256:huella');
  expect(ssh.runDiagnostic).toHaveBeenCalledTimes(2);
  expect(repository.saveDiagnosticWithAction).toHaveBeenCalledTimes(1);
});

test('si no se confía en la huella no se ejecuta nada', async () => {
  await render();
  ssh.runDiagnostic.mockRejectedValueOnce(new SshError('host-key-unknown', 'confirme'));
  await press('Ejecutar uptime');
  await press('No confiar');
  expect(ssh.trustHostKey).not.toHaveBeenCalled();
  expect(text()).not.toContain('SHA256:huella');
});

test('si la huella cambió avisa y permite olvidarla explícitamente', async () => {
  await render();
  ssh.runDiagnostic.mockRejectedValueOnce(
    new SshError('host-key-changed', 'La huella del equipo no coincide. No se envió la contraseña.'),
  );
  await press('Ejecutar uptime');
  expect(text()).toContain('No se envió la contraseña');
  expect(ssh.forgetHostKey).not.toHaveBeenCalled();
  await press('Olvidar huella guardada');
  expect(ssh.forgetHostKey).toHaveBeenCalledWith('10.0.2.2', 2222);
});

test('muestra el error de autenticación', async () => {
  await render();
  ssh.runDiagnostic.mockRejectedValueOnce(new SshError('auth', 'Usuario o contraseña incorrectos.'));
  await press('Ejecutar uptime');
  expect(text()).toContain('Usuario o contraseña incorrectos.');
  expect(repository.saveDiagnosticWithAction).not.toHaveBeenCalled();
});

test('sin credencial no permite ejecutar comandos', async () => {
  await render(null);
  expect(node('Ejecutar uptime').props.disabled).toBe(true);
});
