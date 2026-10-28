import react from '@vitejs/plugin-react';
import { defineTaskmintConfig } from '../../vitest.shared';

export default defineTaskmintConfig({
  packageDir: 'packages/client',
  environment: 'jsdom',
  plugins: [react()],
  setupFiles: ['./src/__tests__/setup/global-mocks.ts', './src/setupTests.ts'],
  // Floors a little under actual coverage (ratcheted 2026-10-28 after P14c:
  // 82.4 / 84.5 / 88.2 / 88.1). They rise to 100 slice by slice in phase P14
  // of docs/web-support-plan.md; the slices done so far are held at 100.
  thresholds: {
    branches: 81,
    functions: 84,
    lines: 88,
    statements: 87,
  },
  fullyCovered: [
    'src/utils/**',
    'src/services/**',
    'src/types/**',
    'src/theme/**',
    'src/hooks/**',
    'src/contexts/**',
    'src/notifications/**',
  ],
});
