import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = `http://127.0.0.1:8094${process.env.GALLERY_BASE_PATH ?? "/"}`;
export default defineConfig({
  testDir: ".",
  testMatch: "gallery-pages.e2e.ts",
  outputDir: "coverage/gallery-pages",
  use: { baseURL, viewport: { width: 1600, height: 1000 }, trace: "retain-on-failure" },
  webServer: {
    cwd: resolve(import.meta.dirname, "../.."),
    command: "node gallery/script/gallery.mjs serve --port 8094",
    url: `${baseURL}preview.html`,
    reuseExistingServer: false,
  },
});
