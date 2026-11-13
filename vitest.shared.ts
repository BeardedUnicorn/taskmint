/**
 * The vitest setup every TypeScript package uses. Coverage exclusions come
 * from coverage-policy.json only, so a package can't quietly grow its own
 * list (scripts/check-coverage-policy.mjs rejects configs that try).
 */

import { defineConfig, type ViteUserConfig } from 'vitest/config';
import policy from './coverage-policy.json';

export interface TaskmintTestOptions {
  /** The package's path from the repo root, as listed in coverage-policy.json. */
  packageDir: string;
  environment: 'jsdom' | 'node';
  plugins?: ViteUserConfig['plugins'];
  setupFiles?: string[];
}

const packages: Record<string, { glob: string }[]> = policy.typescript.packages;

export function defineTaskmintConfig({ packageDir, environment, plugins, setupFiles }: TaskmintTestOptions) {
  const own = packages[packageDir];
  if (!own) {
    throw new Error(`${packageDir} is not listed in coverage-policy.json`);
  }
  return defineConfig({
    plugins,
    test: {
      environment,
      globals: true,
      setupFiles,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      // Tests run as a dev build (scripts/environment.mjs)
      env: { TASKMINT_ENV: 'dev' },
      testTimeout: 10000,
      hookTimeout: 10000,
      reporters: ['verbose'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [...policy.typescript.allPackages, ...own].map(entry => entry.glob),
        thresholds: { 100: true },
      },
    },
  });
}
