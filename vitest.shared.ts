/**
 * The vitest setup every TypeScript package uses. Coverage exclusions come
 * from coverage-policy.json only, so a package can't quietly grow its own
 * list (scripts/check-coverage-policy.mjs rejects configs that try).
 */

import { defineConfig, type ViteUserConfig } from 'vitest/config';
import policy from './coverage-policy.json';

interface Thresholds {
  branches: number;
  functions: number;
  lines: number;
  statements: number;
}

export interface TaskmintTestOptions {
  /** The package's path from the repo root, as listed in coverage-policy.json. */
  packageDir: string;
  environment: 'jsdom' | 'node';
  plugins?: ViteUserConfig['plugins'];
  setupFiles?: string[];
  /** Floors under 100, only while a package is still ratcheting up. */
  thresholds?: Thresholds;
}

const packages: Record<string, { glob: string }[]> = policy.typescript.packages;

export function defineTaskmintConfig({
  packageDir,
  environment,
  plugins,
  setupFiles,
  thresholds,
}: TaskmintTestOptions) {
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
      testTimeout: 10000,
      hookTimeout: 10000,
      reporters: ['verbose'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [...policy.typescript.allPackages, ...own].map(entry => entry.glob),
        thresholds: thresholds ?? { 100: true },
      },
    },
  });
}
