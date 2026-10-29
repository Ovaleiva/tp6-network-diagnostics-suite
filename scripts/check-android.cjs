// Diagnóstico de solo lectura: no instala ni modifica la configuración de la PC.
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

let failures = 0;
function check(label, valid, detail) {
  console.log(`${valid ? 'OK' : 'FALTA'}: ${label} - ${detail}`);
  if (!valid) {
    failures++;
  }
}
function command(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8' });
  return {
    ok: !result.error && result.status === 0,
    text: (result.stdout || '') + (result.stderr || ''),
  };
}

console.log('Diagnóstico Android · Network Diagnostics Suite');
const javaBin = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', 'java.exe')
  : 'java';
const javacBin = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', 'javac.exe')
  : 'javac';
const java = command(javaBin, ['-version']);
const javac = command(javacBin, ['-version']);
const major = Number(java.text.match(/version "(\d+)/)?.[1]);
const compilerMajor = Number(javac.text.match(/javac (\d+)/)?.[1]);
check(
  'JDK 17',
  java.ok && major === 17 && javac.ok && compilerMajor === 17,
  java.text.trim() || 'java/javac no disponibles',
);
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk');
check('Android SDK', existsSync(sdk), sdk);
const gradle = readFileSync(
  join(__dirname, '..', 'android', 'build.gradle'),
  'utf8',
);
for (const [key, prefix] of [
  ['compileSdkVersion', 'platforms/android-'],
  ['buildToolsVersion', 'build-tools/'],
  ['ndkVersion', 'ndk/'],
]) {
  const version = gradle.match(new RegExp(key + '\\s*=\\s*"?([0-9.]+)'))?.[1];
  const candidates = version ? [join(sdk, prefix + version)] : [];
  // Desde API 37, Google publica la plataforma base con sufijo de revisión .0.
  if (key === 'compileSdkVersion' && version && !version.includes('.')) {
    candidates.push(join(sdk, prefix + version + '.0'));
  }
  const target = candidates.find(existsSync) || candidates[0] || '';
  check(
    key,
    Boolean(target) && existsSync(target),
    target || 'revisar android/build.gradle',
  );
}
const adbPath = join(sdk, 'platform-tools', 'adb.exe');
const adb = command(existsSync(adbPath) ? adbPath : 'adb', ['devices']);
check(
  'Dispositivo Android autorizado',
  adb.ok && /\S+\s+device\r?\n/.test(adb.text),
  adb.text.trim() || 'adb no disponible',
);
console.log(
  failures
    ? 'Completar docs/ENTORNO.md antes de compilar.'
    : 'Herramientas básicas disponibles para compilar y ejecutar Android.',
);
process.exitCode = failures ? 1 : 0;
