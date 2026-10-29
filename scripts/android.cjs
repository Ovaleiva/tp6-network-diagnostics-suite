const { existsSync } = require('node:fs');
const { homedir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');

function value(env, name) {
  const key = Object.keys(env).find(item => item.toUpperCase() === name);
  return key ? env[key] : undefined;
}

function probe(executable, args, env) {
  const result = spawnSync(executable, args, {
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  });
  return {
    ok: !result.error && result.status === 0,
    text: (result.stdout || '') + (result.stderr || ''),
  };
}

function registryValue(scope, name, env) {
  const registry = join(
    value(env, 'SYSTEMROOT') || 'C:/Windows',
    'System32',
    'reg.exe',
  );
  const key =
    scope === 'user'
      ? 'HKCU\\Environment'
      : 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';
  const result = probe(registry, ['query', key, '/v', name], env);
  if (!result.ok) {
    return undefined;
  }
  const match = result.text.match(
    new RegExp('^\\s*' + name + '\\s+REG_(?:EXPAND_)?SZ\\s+(.+)$', 'mi'),
  );
  return match?.[1].trim();
}

function expand(input, env) {
  if (!input) {
    return undefined;
  }
  return input
    .trim()
    .replace(/^"|"$/g, '')
    .replace(
      /%([^%]+)%/g,
      (token, name) => value(env, name.toUpperCase()) || token,
    );
}

function isJdk17(directory, env) {
  if (!directory || !existsSync(join(directory, 'bin', 'javac.exe'))) {
    return false;
  }
  const java = probe(join(directory, 'bin', 'java.exe'), ['-version'], env);
  const javac = probe(join(directory, 'bin', 'javac.exe'), ['-version'], env);
  return (
    java.ok &&
    /version "17(?:\.|")/.test(java.text) &&
    javac.ok &&
    /javac 17(?:\.|\s|$)/.test(javac.text)
  );
}

function setValue(env, name, input) {
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === name) {
      delete env[key];
    }
  }
  env[name] = input;
}

// Preparar solo el entorno del proceso hijo; no modifica variables de Windows.
function androidEnvironment(baseEnv = process.env) {
  const env = { ...baseEnv };
  if (process.platform !== 'win32') {
    return env;
  }

  const candidates = [
    value(env, 'JAVA_HOME'),
    registryValue('user', 'JAVA_HOME', env),
    registryValue('machine', 'JAVA_HOME', env),
  ].map(item => expand(item, env));
  let javaHome = candidates.find(candidate => isJdk17(candidate, env));
  if (!javaHome) {
    const where = join(
      value(env, 'SYSTEMROOT') || 'C:/Windows',
      'System32',
      'where.exe',
    );
    const javaPaths = probe(where, ['java.exe'], env)
      .text.trim()
      .split(/\r?\n/);
    javaHome = javaPaths
      .map(file => dirname(dirname(file)))
      .find(candidate => isJdk17(candidate, env));
  }
  if (!javaHome) {
    throw new Error(
      'No se encontró JDK 17. Revisá la instalación indicada en docs/EMULADOR.md.',
    );
  }

  const profile = value(env, 'USERPROFILE') || homedir();
  const sdkCandidates = [
    value(env, 'ANDROID_HOME'),
    value(env, 'ANDROID_SDK_ROOT'),
    registryValue('user', 'ANDROID_HOME', env),
    registryValue('machine', 'ANDROID_HOME', env),
    registryValue('user', 'ANDROID_SDK_ROOT', env),
    registryValue('machine', 'ANDROID_SDK_ROOT', env),
    'C:/Android/Sdk',
    join(profile, 'AppData', 'Local', 'Android', 'Sdk'),
  ].map(item => expand(item, env));
  const sdk = sdkCandidates.find(
    candidate =>
      candidate && existsSync(join(candidate, 'platform-tools', 'adb.exe')),
  );
  if (!sdk) {
    throw new Error(
      'No se encontró el SDK con platform-tools/adb.exe. Revisá ANDROID_HOME y docs/EMULADOR.md.',
    );
  }

  const androidHome =
    expand(value(env, 'ANDROID_USER_HOME'), env) || join(profile, '.android');
  const avdHome =
    expand(value(env, 'ANDROID_AVD_HOME'), env) || join(androidHome, 'avd');
  const previousPath = value(env, 'PATH') || '';
  setValue(env, 'JAVA_HOME', javaHome);
  setValue(env, 'ANDROID_HOME', sdk);
  setValue(env, 'ANDROID_SDK_ROOT', sdk);
  setValue(env, 'ANDROID_USER_HOME', androidHome);
  setValue(env, 'ANDROID_AVD_HOME', avdHome);
  setValue(
    env,
    'PATH',
    [
      join(javaHome, 'bin'),
      join(sdk, 'platform-tools'),
      join(sdk, 'emulator'),
      join(sdk, 'cmdline-tools', 'latest', 'bin'),
      previousPath,
    ].join(';'),
  );
  return env;
}

function main() {
  const action = process.argv[2] || 'run';
  if (!['run', 'doctor', 'env'].includes(action)) {
    throw new Error('Acción Android desconocida: ' + action);
  }
  const env = androidEnvironment();
  console.log(
    'Android: JAVA_HOME=' + (value(env, 'JAVA_HOME') || '(del sistema)'),
  );
  console.log(
    'Android: SDK=' + (value(env, 'ANDROID_HOME') || '(del sistema)'),
  );

  if (action === 'env') {
    console.log(
      'Android: AVD_HOME=' +
        (value(env, 'ANDROID_AVD_HOME') || '(del sistema)'),
    );
    for (const [executable, args] of [
      ['java', ['-version']],
      ['adb', ['version']],
      ['emulator', ['-list-avds']],
    ]) {
      const result = probe(executable, args, env);
      if (result.text.trim()) {
        console.log(result.text.trim());
      }
      if (!result.ok) {
        process.exitCode = 1;
      }
    }
    return;
  }

  const args =
    action === 'doctor'
      ? [join(__dirname, 'check-android.cjs')]
      : [
          join(root, 'node_modules', 'react-native', 'cli.js'),
          'run-android',
          ...process.argv.slice(3),
        ];
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  child.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', code => {
    process.exitCode = code ?? 1;
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { androidEnvironment };
