import { defineTaskmintConfig } from '../../vitest.shared';

export default defineTaskmintConfig({
  packageDir: 'apps/desktop',
  environment: 'jsdom',
});
