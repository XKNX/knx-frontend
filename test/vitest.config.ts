import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom", // to run in browser-like environment
    env: {
      TZ: "Etc/UTC",
      IS_TEST: "true",
    },
    exclude: ["homeassistant-frontend/**/*", "**/node_modules/**", "build/**/*"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
      provider: "v8",
      reportsDirectory: "test/coverage",
    },
  },
});
