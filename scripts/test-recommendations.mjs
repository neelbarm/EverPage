import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const directory = await mkdtemp(join(tmpdir(), 'everpage-recommendation-tests.'));
const output = join(directory, 'recommendations.cjs');
await build({
  entryPoints: [resolve('artifacts/api-server/src/routes/recommendations.test.ts')],
  outfile: output, bundle: true, platform: 'node', format: 'cjs',
  external: ['pg-native', '@google-cloud/*'],
});

// All query results and fetch calls are replaced by the suite. Never load
// production credentials, even when invoked from a configured developer shell.
const result = spawnSync(process.execPath, ['--test', output], {
  stdio: 'inherit',
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    DATABASE_URL: 'postgresql://127.0.0.1:1/unused_recommendation_test',
    NODE_PATH: resolve('artifacts/api-server/node_modules'),
  },
});
process.exitCode = result.status ?? 1;
