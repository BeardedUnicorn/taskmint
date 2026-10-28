import { defineTaskmintConfig } from '../../vitest.shared';

// The service worker has no DOM; the page's scripts' tests ask for jsdom.
export default defineTaskmintConfig({
  packageDir: 'apps/extension',
  environment: 'node',
});
