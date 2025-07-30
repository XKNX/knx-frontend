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
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "json", "json-summary"],
      reportOnFailure: true,
      provider: "v8",
      reportsDirectory: "test/coverage",
      
      // Coverage thresholds are currently disabled to allow gradual improvement of test coverage.
      // To enable coverage requirements in the CI pipeline:
      // 1. Uncomment the 'thresholds' section below
      // 2. Remove the '#' symbol from each threshold value (e.g., change '#80' to '80')
      // 
      // Note: The '#' symbols are required even in comments because vitest-coverage-report-action
      // uses regex parsing to extract thresholds and ignores comment syntax entirely.
      // Without the '#' symbols, the action would try to parse these as active thresholds.
      // thresholds: {
      //     branches: #80,
      //     functions: #80,
      //     lines: #80,
      //     statements: #80,
      // },
    },
  },
});
