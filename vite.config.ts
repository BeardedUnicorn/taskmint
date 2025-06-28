import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), visualizer()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [
      "./src/setupTests.ts",
      "./src/__tests__/integration/test-setup.ts",
      "./src/__tests__/setup/import-meta-mock.ts",
    ],
    exclude: [
      "node_modules",
      "src/__tests__/integration/test-setup.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/**/__tests__/**",
        "src/**/*.test.*",
        "src/**/*.spec.*",
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
    mockClear: true,
    restoreMocks: true,
    verbose: true,
    testTimeout: 10000,
    // Vitest's fakeTimers options might be slightly different
    // You might need to use `vi.useFakeTimers()` in setup files
  },
});
