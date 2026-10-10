import { resolve } from "path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  define: {
    __DEMO__: false,
    __DEV__: false,
  },
  test: {
    alias: [
      { find: /^(lit\/.+?|@lit-labs\/.+?\/.+?)(?<!\.js)$/, replacement: "$1.js" },
      {
        find: /.*\/build\/mdi\/iconMetadata\.json$/,
        replacement: resolve(__dirname, "test/mocks/iconMetadata.json"),
      },
      {
        find: /.*\/build\/translations\/translationMetadata\.json$/,
        replacement: resolve(__dirname, "test/mocks/translationMetadata.json"),
      },
    ],
    environment: "jsdom", // to run in browser-like environment
    env: {
      TZ: "Etc/UTC",
      IS_TEST: "true",
    },
    include: [
      "src/**/*.{test,spec}.ts",
      "test/**/*.{test,spec}.ts",
      "build-scripts/**/*.{test,spec}.ts",
      "gallery/src/**/*.{test,spec}.ts",
      "gallery/test/**/*.{test,spec}.ts",
    ],
    exclude: [
      "homeassistant-frontend/**/*",
      "**/node_modules/**",
      "knx-frontend/**/*",
      ".git/**",
      ".claude/**",
      "**/.worktrees/**",
      "test/**/*.e2e.ts",
      "test/playwright.*.ts",
      "gallery/test/**/*.e2e.ts",
      "gallery/test/playwright.*.ts",
    ],
    bail: 0, // Don't stop after first failure, run all tests
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "json", "lcov"],
      reportOnFailure: true,
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
