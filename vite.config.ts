import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
          if (/\/node_modules\/(dayjs|date-fns)\//.test(id)) return 'date-vendor';
          if (id.includes('/node_modules/@tauri-apps/')) return 'tauri-vendor';
          if (id.includes('/node_modules/@sentry/')) return 'sentry-vendor';
          return undefined;
        },
      },
    },
  },
});
