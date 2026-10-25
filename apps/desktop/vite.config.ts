import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Favicon and logos live with the shared client.
  publicDir: "../../packages/client/public",
  // .env (VITE_SENTRY_DSN) stays at the repo root.
  envDir: "../..",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Separate vendor chunks for better caching. Rolldown (vite 8)
        // only accepts the function form.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('/node_modules/@mui/')) return 'mui-vendor';
          if (/\/node_modules\/(recharts|victory-vendor|d3-[^/]+)\//.test(id)) return 'chart-vendor';
          if (id.includes('/node_modules/dayjs/')) return 'date-vendor';
          if (id.includes('/node_modules/@tauri-apps/')) return 'tauri-vendor';
          if (id.includes('/node_modules/@sentry/')) return 'sentry-vendor';
          return undefined;
        },
      },
    },
  },
});
