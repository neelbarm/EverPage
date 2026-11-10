import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const app = resolve('artifacts/nexpage');
const directory = await mkdtemp(join(tmpdir(), 'everpage-screen-tests.'));
const outputs = [];
const mockedModules = [
  'react-native', '@react-native-async-storage/async-storage', 'expo-router',
  'react-native-safe-area-context', 'expo-haptics', '@expo/vector-icons',
  '@/hooks/useColors', '@/context/StoreContext', '@/context/SocialContext',
  '@/components/BookCover', '@/lib/auth', '@/lib/api',
  '@/context/ThemeContext', '@/components/DailyGoalModal',
];
for (const suite of ['screens', 'shelf']) {
  const fixture = join(app, `test/${suite}-runtime.ts`);
  const output = join(directory, `${suite}.cjs`);
  await build({
    entryPoints: [join(app, `test/${suite}.integration.test.tsx`)], outfile: output,
    bundle: true, platform: 'node', format: 'cjs',
    external: ['react', 'react-test-renderer'],
    alias: Object.fromEntries(mockedModules.map(name => [name, fixture])),
  });
  outputs.push(output);
}
// Real screen handlers, fake native services/API: never contacts a live server.
const result = spawnSync(process.execPath, ['--test', ...outputs], {
  stdio: 'inherit', env: { ...process.env, NODE_PATH: join(app, 'node_modules') },
});
process.exitCode = result.status ?? 1;
