// Bundles the function into dist/, which firebase.json deploys: one file,
// with the two Firebase packages left to Cloud Build to install from the
// package.json written beside it. That one has only those two, at this
// package's exact versions: Cloud Build runs npm there, which knows nothing
// of the workspace or its catalog.

import { build } from 'esbuild';
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = `${root}dist`;
const own = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));

rmSync(dist, { recursive: true, force: true });
await build({
  entryPoints: [`${root}src/index.ts`],
  outfile: `${dist}/index.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: Object.keys(own.dependencies),
  logLevel: 'warning',
});
writeFileSync(
  `${dist}/package.json`,
  `${JSON.stringify(
    {
      name: 'taskmint-functions',
      private: true,
      type: 'module',
      main: 'index.js',
      engines: { node: '22' },
      dependencies: own.dependencies,
    },
    null,
    2
  )}\n`
);
// firebase-tools loads the function here to see what it declares, so the two
// packages have to resolve; the link isn't uploaded (firebase.json ignores it)
symlinkSync(`${root}node_modules`, `${dist}/node_modules`, 'dir');
