import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// CI tests the built gallery at its Pages base path; locally the dev server needs no build.
const ci = Boolean(process.env.CI);
const production = process.env.GALLERY_E2E_PRODUCTION === "1";
const baseURL = `http://127.0.0.1:8092${production ? (process.env.GALLERY_BASE_PATH ?? "/") : "/"}`;

export default defineConfig({
  testDir: ".",
  outputDir: resolve(import.meta.dirname, "../../test-results/gallery"),
  retries: ci ? 1 : 0,
  reporter: ci
    ? [["list"], ["blob", { outputDir: resolve(import.meta.dirname, "../../blob-report/gallery") }]]
    : "list",
  testMatch: "gallery.e2e.ts",
  fullyParallel: true,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@mobile-touch/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
    },
    {
      name: "mobile-chrome",
      grep: /@mobile/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    cwd: resolve(import.meta.dirname, "../.."),
    env: { NO_UPDATE_CHECK: "1" },
    command: production
      ? "node gallery/script/gallery.mjs serve --port 8092"
      : "pnpm gallery --port 8092",
    url: production ? `${baseURL}preview.html` : baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
