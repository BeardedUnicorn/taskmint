import react from '@vitejs/plugin-react';
import { defineTaskmintConfig } from '../../vitest.shared';

export default defineTaskmintConfig({
  packageDir: 'packages/client',
  environment: 'jsdom',
  plugins: [react()],
  setupFiles: ['./src/__tests__/setup/global-mocks.ts', './src/setupTests.ts'],
  // Floors a little under actual coverage (ratcheted 2026-10-27 after P14a:
  // 78.1 / 80.0 / 84.9 / 84.2). They rise to 100 slice by slice in phase P14
  // of docs/web-support-plan.md; the slices done so far are held at 100.
  thresholds: {
    branches: 77,
    functions: 79,
    lines: 84,
    statements: 83,
  },
  fullyCovered: ['src/utils/**', 'src/services/**', 'src/types/**', 'src/theme/**'],
});
