/**
 * Which Firebase project a build talks to: production (`taskmint-f9a05`,
 * what releases use) or dev (`taskmint-dev`, every other build). One
 * variable, TASKMINT_ENV, chooses it for every tool a build runs:
 *
 * - Vite (apps/web, apps/desktop): the Firebase config, Sentry's
 *   environment and dist/environment.json (this module's plugin);
 * - Cargo (apps/desktop/src-tauri/build.rs): the desktop's capture port,
 *   link scheme and start-up check;
 * - Gradle (gen/android/app/build.gradle.kts): the Android package, label
 *   and google-services.json.
 *
 * Unset means dev. Only scripts/release.mjs and the release workflow's web
 * job set `production`. Anything else stops the build.
 */

import { readFileSync } from 'node:fs';

/** The environments, and the Firebase project each one's builds use. */
export const ENVIRONMENTS = {
  production: { projectId: 'taskmint-f9a05' },
  dev: { projectId: 'taskmint-dev' },
};

/** Where a build says which environment it was made for (dist/environment.json). */
export const MARKER_FILE = 'environment.json';

/** The environment `env` names (TASKMINT_ENV), dev when it names none. */
export function taskmintEnvironment(env = process.env) {
  const name = env.TASKMINT_ENV || 'dev';
  if (!Object.hasOwn(ENVIRONMENTS, name)) {
    throw new Error(
      `TASKMINT_ENV is "${name}", but it can only be ${Object.keys(ENVIRONMENTS)
        .map(known => `"${known}"`)
        .join(' or ')} (unset means "dev").`
    );
  }
  return name;
}

/** What dist/environment.json holds for a build made for `name`. */
export function environmentMarker(name) {
  return { environment: name, projectId: ENVIRONMENTS[name].projectId };
}

/**
 * Reads a build's dist/environment.json; throws, saying why, when there's
 * none or it doesn't name a known environment.
 */
export function readEnvironmentMarker(path) {
  let marker;
  try {
    marker = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path} can't be read (${error.message}). Build first.`);
  }
  const name = marker?.environment;
  if (!Object.hasOwn(ENVIRONMENTS, name ?? '') || marker.projectId !== ENVIRONMENTS[name].projectId) {
    throw new Error(`${path} doesn't name a known environment: ${JSON.stringify(marker)}`);
  }
  return marker;
}

/**
 * The Vite plugin that makes a build its environment's: it defines
 * `import.meta.env.TASKMINT_ENV`, writes dist/environment.json, and titles a
 * dev page "TaskMint Dev".
 */
export function taskmintEnvironmentPlugin(env = process.env) {
  const name = taskmintEnvironment(env);
  return {
    name: 'taskmint-environment',
    config: () => ({ define: { 'import.meta.env.TASKMINT_ENV': JSON.stringify(name) } }),
    transformIndexHtml: html =>
      name === 'production' ? html : html.replace('<title>TaskMint</title>', '<title>TaskMint Dev</title>'),
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: MARKER_FILE,
        source: `${JSON.stringify(environmentMarker(name))}\n`,
      });
    },
  };
}
