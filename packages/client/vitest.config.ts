import react from '@vitejs/plugin-react';
import { defineTaskmintConfig } from '../../vitest.shared';

export default defineTaskmintConfig({
  packageDir: 'packages/client',
  environment: 'jsdom',
  plugins: [react()],
  setupFiles: ['./src/__tests__/setup/global-mocks.ts', './src/setupTests.ts'],
  // Floors a little under actual coverage (ratcheted 2026-10-14 at the end
  // of app review 3: 79.8 / 72.4 / 77.0 / 80.7). They rise to 100 slice by
  // slice in phase P14 of docs/web-support-plan.md.
  thresholds: {
    branches: 71,
    functions: 75,
    lines: 79,
    statements: 78,
  },
});
