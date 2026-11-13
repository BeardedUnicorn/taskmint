import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { taskmintEnvironmentPlugin } from '../../scripts/environment.mjs';

// The web app: built into dist/, which Firebase Hosting serves
// (firebase.json). It syncs with the dev project unless TASKMINT_ENV is
// production (scripts/environment.mjs), or with the emulators when a
// development build sets VITE_FIREBASE_EMULATOR_HOST (.env).
export default defineConfig({
  plugins: [react(), taskmintEnvironmentPlugin()],
  // Favicon and logos live with the shared client.
  publicDir: '../../packages/client/public',
  // .env (VITE_SENTRY_DSN) stays at the repo root.
  envDir: '../..',
  server: {
    port: 1421,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Separate vendor chunks for better caching (rolldown takes the
        // function form only).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('/node_modules/@mui/')) return 'mui-vendor';
          if (/\/node_modules\/(firebase|@firebase)\//.test(id)) return 'firebase-vendor';
          if (/\/node_modules\/(recharts|victory-vendor|d3-[^/]+)\//.test(id)) return 'chart-vendor';
          if (id.includes('/node_modules/dayjs/')) return 'date-vendor';
          if (id.includes('/node_modules/@sentry/')) return 'sentry-vendor';
          return undefined;
        },
      },
    },
  },
});
