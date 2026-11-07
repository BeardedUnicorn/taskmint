import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app. In development the API comes from a local taskmint-server
// (`docker compose up -d --wait db migrate server`), through this proxy, so
// the browser sees one origin as it does behind nginx.
export default defineConfig({
  plugins: [react()],
  // Favicon and logos live with the shared client.
  publicDir: '../../packages/client/public',
  // .env (VITE_SENTRY_DSN) stays at the repo root.
  envDir: '../..',
  server: {
    port: 1421,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000' },
    },
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
          if (/\/node_modules\/(recharts|victory-vendor|d3-[^/]+)\//.test(id)) return 'chart-vendor';
          if (id.includes('/node_modules/dayjs/')) return 'date-vendor';
          if (id.includes('/node_modules/@sentry/')) return 'sentry-vendor';
          return undefined;
        },
      },
    },
  },
});
