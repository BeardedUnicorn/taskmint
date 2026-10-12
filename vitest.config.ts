import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Test environment
    environment: 'jsdom',

    // Global setup
    globals: true,
    setupFiles: ['./src/__tests__/setup/global-mocks.ts', './src/setupTests.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**',
        '**/build/**',
        'src-tauri/target/**',
        'src-tauri/gen/**',
      ],
      include: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.test.{ts,tsx}',
        '!src/**/*.spec.{ts,tsx}',
      ],
      // The pre-vitest-4 config nested these under `thresholds.global`, which
      // vitest treated as a file glob and never enforced. These floors sit just
      // under actual coverage (ratcheted 2026-10 after dead-code removal);
      // raise them as coverage improves.
      thresholds: {
        branches: 40,
        functions: 43,
        lines: 48,
        statements: 48,
      },
    },

    // Test patterns
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/__tests__/**/*.test.{ts,tsx}',
    ],
    exclude: [
      'node_modules/',
      'dist/',
      'build/',
      'src-tauri/',
      'src/__tests__/setup/**',
      'src/__tests__/manual/**',
      'src/__tests__/integration/test-setup.ts',
    ],

    // Test timeout
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporters
    reporters: ['verbose'],
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@constants': path.resolve(__dirname, './src/constants'),
    },
  },
});
