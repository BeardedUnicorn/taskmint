import react from '@vitejs/plugin-react';
import { defineTaskmintConfig } from '../../vitest.shared';

export default defineTaskmintConfig({
  packageDir: 'apps/desktop',
  environment: 'jsdom',
  plugins: [react()],
  setupFiles: ['./src/setupTests.ts'],
});
