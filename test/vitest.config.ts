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
    bail: 0, // Don't stop after first failure, run all tests
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "json", "lcov"],
      reportOnFailure: true,
      all: true,
      provider: "v8",
      reportsDirectory: "test/coverage",
      // Coverage thresholds are currently disabled to allow gradual improvement of test coverage.
      // thresholds: {
      //     branches: 80,
      //     functions: 80,
      //     lines: 80,
      //     statements: 80,
      // },
    },
  },
});
