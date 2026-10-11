import { defineConfig } from "@playwright/test";
import shared from "./playwright.gallery.config";

export default defineConfig(shared, {
  testMatch: "gallery-benchmark.e2e.ts",
  projects: [{ name: "chromium" }],
});
