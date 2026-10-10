import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "gallery-thumbnails.ts",
  outputDir: "coverage/gallery-thumbnails",
  fullyParallel: true,
  workers: 2,
  maxFailures: 1,
  use: {
    baseURL: `http://127.0.0.1:8093${process.env.GALLERY_BASE_PATH ?? "/"}`,
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "UTC",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: resolve(import.meta.dirname, "../.."),
    env: { NO_UPDATE_CHECK: "1" },
    command: "node gallery/script/gallery.mjs serve --port 8093",
    url: `http://127.0.0.1:8093${process.env.GALLERY_BASE_PATH ?? "/"}preview.html`,
    reuseExistingServer: false,
  },
});
