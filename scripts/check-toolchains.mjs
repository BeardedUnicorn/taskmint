#!/usr/bin/env node
/**
 * The pinned toolchains agree everywhere they're named:
 *
 * - rust-toolchain.toml's X.Y is the server image's rust:X.Y (the Docker
 *   builds don't see the toolchain file, so the image keeps its own tag);
 * - .node-version is the major of every node:NN image in the Dockerfiles
 *   (CI's setup-node reads .node-version itself).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFileSync(join(root, file), 'utf8');

const problems = [];

const channel = read('rust-toolchain.toml').match(/^channel\s*=\s*"(\d+)\.(\d+)(?:\.\d+)?"/m);
if (!channel) {
  problems.push('rust-toolchain.toml: no channel = "X.Y.Z"');
} else {
  const rust = `${channel[1]}.${channel[2]}`;
  const images = [...read('apps/server/Dockerfile').matchAll(/FROM rust:(\d+\.\d+)\S*/g)].map(match => match[1]);
  if (images.length === 0) problems.push('apps/server/Dockerfile: no FROM rust:X.Y image');
  for (const image of images) {
    if (image !== rust) problems.push(`apps/server/Dockerfile uses rust:${image}, rust-toolchain.toml says ${rust}`);
  }
}

const node = read('.node-version').trim();
if (!/^\d+$/.test(node)) problems.push(`.node-version should be a major version, not "${node}"`);
for (const file of ['apps/web/Dockerfile', 'apps/server/Dockerfile']) {
  const images = [...read(file).matchAll(/\bnode:(\d+)\S*/g)].map(match => match[1]);
  for (const image of images) {
    if (image !== node) problems.push(`${file} uses node:${image}, .node-version says ${node}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`Toolchains agree: Rust ${channel[1]}.${channel[2]}, Node ${node}`);
