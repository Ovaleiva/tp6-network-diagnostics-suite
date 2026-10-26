const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = join(__dirname, '..');
const output = join(root, 'artifacts', 'android');
mkdirSync(output, { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    join(root, 'node_modules', 'react-native', 'cli.js'),
    'bundle',
    '--platform',
    'android',
    '--dev',
    'false',
    '--entry-file',
    'index.js',
    '--bundle-output',
    join(output, 'index.android.bundle'),
    '--assets-dest',
    output,
    '--max-workers',
    '2',
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) {
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
