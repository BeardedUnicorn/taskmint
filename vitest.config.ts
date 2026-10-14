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
        'src/**/__mocks__/**',
        'src/setupTests.ts',
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
      // Floors a little under actual coverage (ratcheted 2026-10-13 with the
      // notification core: 77.3 / 70.3 / 74.4 / 78.2); raise them as coverage
      // improves.
      thresholds: {
        branches: 68,
        functions: 72,
        lines: 76,
        statements: 75,
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
