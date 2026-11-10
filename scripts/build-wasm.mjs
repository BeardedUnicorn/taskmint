#!/usr/bin/env node
/**
 * Builds the web app's core: crates/taskmint-wasm for wasm32, then
 * wasm-bindgen's JavaScript for it, into apps/web/src/wasm (not committed:
 * verify and CI build it before the TypeScript checks need it).
 *
 * wasm-bindgen's CLI must be the version of the wasm-bindgen crate in
 * Cargo.lock: `cargo install wasm-bindgen-cli --version <that> --locked`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });

/** The wasm-bindgen crate's version in Cargo.lock. */
export function lockedWasmBindgen(lock) {
  const match = lock.match(/\[\[package\]\]\nname = "wasm-bindgen"\nversion = "([^"]+)"/);
  if (!match) throw new Error('Cargo.lock has no wasm-bindgen');
  return match[1];
}

function main() {
  const wanted = lockedWasmBindgen(readFileSync(join(root, 'Cargo.lock'), 'utf8'));
  let installed;
  try {
    installed = execFileSync('wasm-bindgen', ['--version'], { encoding: 'utf8' }).trim().split(' ').pop();
  } catch {
    installed = null;
  }
  if (installed !== wanted) {
    console.error(
      `wasm-bindgen ${wanted} is needed (found ${installed ?? 'none'}): cargo install wasm-bindgen-cli --version ${wanted} --locked`
    );
    process.exit(1);
  }
  run('cargo', ['build', '-p', 'taskmint-wasm', '--target', 'wasm32-unknown-unknown', '--release']);
  run('wasm-bindgen', [
    '--target',
    'web',
    '--out-dir',
    'apps/web/src/wasm',
    '--out-name',
    'taskmint_core',
    'target/wasm32-unknown-unknown/release/taskmint_wasm.wasm',
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
