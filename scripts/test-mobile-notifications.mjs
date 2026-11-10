import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const app = resolve('artifacts/nexpage');
const fixture = join(app, 'test/notifications-runtime.ts');
const directory = await mkdtemp(join(tmpdir(), 'everpage-notification-tests.'));
const output = join(directory, 'notifications.cjs');

// Bundle the real helper against local native-module substitutes. This suite
// never loads an Expo service client or contacts the API, Expo, or APNs.
await build({
  entryPoints: [join(app, 'test/notifications.test.ts')], outfile: output,
  bundle: true, platform: 'node', format: 'cjs',
  alias: {
    'react-native': fixture,
    'expo-notifications': fixture,
    'expo-constants': fixture,
    'expo-device': fixture,
    'expo-router': fixture,
    '@react-native-async-storage/async-storage': fixture,
  },
});

const result = spawnSync(process.execPath, ['--test', output], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
