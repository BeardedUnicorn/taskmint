// Bundles the extension into dist/, for chrome://extensions → Load unpacked:
// the scripts, one file each under the names manifest.json gives them
// (classic scripts, as Chrome loads them), the manifest itself (its `key` pins
// the extension's ID, which the desktop app checks) and the icons.

import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = `${root}dist`;

rmSync(dist, { recursive: true, force: true });
await build({
  entryPoints: ['background', 'content', 'interceptor'].map(name => `${root}src/${name}.ts`),
  outdir: dist,
  bundle: true,
  format: 'iife',
  // manifest.json's minimum_chrome_version
  target: 'chrome120',
  logLevel: 'warning',
});
cpSync(`${root}manifest.json`, `${dist}/manifest.json`);
cpSync(`${root}icons`, `${dist}/icons`, { recursive: true });
