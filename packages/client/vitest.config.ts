import react from '@vitejs/plugin-react';
import { defineTaskmintConfig } from '../../vitest.shared';

export default defineTaskmintConfig({
  packageDir: 'packages/client',
  environment: 'jsdom',
  plugins: [react()],
  setupFiles: ['./src/__tests__/setup/global-mocks.ts', './src/setupTests.ts'],
});
