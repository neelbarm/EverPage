import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const app = resolve('artifacts/nexpage');
const fixture = join(app, 'test/store-runtime.ts');
const directory = await mkdtemp(join(tmpdir(), 'everpage-mobile-tests.'));
const outputs = [];
for (const suite of ['store', 'auth']) {
const output = join(directory, `${suite}.cjs`);
await build({
  entryPoints: [join(app, `test/${suite}.integration.test.tsx`)], outfile: output,
  bundle: true, platform: 'node', format: 'cjs', define: { __DEV__: 'false' },
  // React's bundled act implementation falls back to MessageChannel, whose
  // ports keep Node alive. Keep React external so act uses Node's scheduler.
  external: ['react', 'react-test-renderer'],
  alias: {
    'react-native': fixture,
    '@react-native-async-storage/async-storage': fixture,
    '@/lib/auth': fixture,
    '@/lib/storage': fixture,
    '@/lib/notifications': fixture,
  },
});
outputs.push(output);
}
const result = spawnSync(process.execPath, ['--test', ...outputs], {
  stdio: 'inherit', env: { ...process.env, NODE_PATH: join(app, 'node_modules') },
});
process.exitCode = result.status ?? 1;
