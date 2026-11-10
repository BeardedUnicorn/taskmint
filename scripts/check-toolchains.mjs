#!/usr/bin/env node
/**
 * The pinned toolchains are well formed:
 *
 * - rust-toolchain.toml names an exact X.Y.Z channel;
 * - .node-version is a major version (CI's setup-node reads it).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFileSync(join(root, file), 'utf8');

const problems = [];

const channel = read('rust-toolchain.toml').match(/^channel\s*=\s*"(\d+\.\d+\.\d+)"/m);
if (!channel) problems.push('rust-toolchain.toml: no channel = "X.Y.Z"');

const node = read('.node-version').trim();
if (!/^\d+$/.test(node)) problems.push(`.node-version should be a major version, not "${node}"`);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`Toolchains pinned: Rust ${channel[1]}, Node ${node}`);
