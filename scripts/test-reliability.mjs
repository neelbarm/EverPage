import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const directory = await mkdtemp(join(tmpdir(), 'everpage-policy-tests.'));
const entries = [
  'artifacts/api-server/src/routes/storage.test.ts',
  'artifacts/api-server/src/routes/reliability-boundaries.test.ts',
  'artifacts/nexpage/lib/offlineQueue.test.ts',
];
const outputs = [];
for (const [index, entry] of entries.entries()) {
  const outfile = join(directory, `test-${index}.cjs`);
  await build({ entryPoints: [resolve(entry)], outfile, bundle: true, platform: 'node', format: 'cjs',
    external: ['pg-native', '@google-cloud/*'],
  });
  outputs.push(outfile);
}
// These suites use pure policies and storage fakes, never a live database.
const result = spawnSync(process.execPath, ['--test', ...outputs], {
  stdio: 'inherit', env: { ...process.env,
    DATABASE_URL: 'postgresql://127.0.0.1:1/unused_policy_test',
    NODE_PATH: resolve('artifacts/api-server/node_modules'),
  },
});
process.exitCode = result.status ?? 1;
