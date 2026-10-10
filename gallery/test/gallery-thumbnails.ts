import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { catalog } from "../src/catalog";
import type { GalleryConfigureMessage } from "../src/types";
import { mockGalleryBrand } from "./brands";

test("publish catalog metadata for PR preview links", async () => {
  const output = resolve("build/gallery");
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, "catalog.json"),
    JSON.stringify(catalog.map(({ meta, covers }) => ({ id: meta.id, title: meta.title, covers }))),
  );
});

// Capture the same fixtures and thumbnail mode used by the former live cards.
// These are build assets, not visual comparison baselines.
for (const { meta } of catalog) {
  for (const mode of ["light", "dark"] as const) {
    test(`${meta.id}-${mode}`, async ({ page, baseURL }) => {
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") failures.push(message.text());
      });
      await page.route("**/*", async (route) => {
        if (await mockGalleryBrand(route)) return;
        const url = new URL(route.request().url());
        if (
          url.origin !== new URL(baseURL!).origin ||
          !url.pathname.startsWith(new URL(baseURL!).pathname) ||
          url.pathname.startsWith(`${new URL(baseURL!).pathname}api/`)
        ) {
          failures.push(`Unexpected request: ${url.href}`);
          await route.abort();
        } else await route.continue();
      });
      await page.clock.setFixedTime(new Date("2026-01-15T12:00:00Z"));
      const width = meta.category === "views" ? 1280 : meta.category === "dialogs" ? 800 : 400;
      await page.setViewportSize({ width, height: Math.round((width * 224) / 400) });
      const output = resolve("build/gallery/thumbnails");
      await mkdir(output, { recursive: true });
      const configure: GalleryConfigureMessage = {
        channel: "knx-gallery",
        type: "configure",
        sessionId: "thumbnail",
        componentId: meta.id,
        scenarioId: meta.scenarios[0].id,
        overrides: {},
        autoHeight: meta.category === "components",
        slots: meta.slots
          .filter((slot) => slot.name !== "header" || meta.id === "knx-sticky-expansion-panel")
          .map((slot) => slot.name),
        theme: { mode, theme: "default" },
      };
      await page.goto("preview.html?thumbnail&session=thumbnail");
      await page.locator("knx-gallery-preview").waitFor();
      // The standalone preview's parent is itself; keep the real protocol validation.
      await page.evaluate((json) => {
        const message = JSON.parse(json) as GalleryConfigureMessage;
        window.addEventListener("message", (event) => {
          if (
            event.source !== window ||
            event.origin !== location.origin ||
            event.data?.channel !== "knx-gallery" ||
            event.data.sessionId !== message.sessionId
          ) {
            return;
          }
          if (event.data.type === "rendered" || event.data.type === "error") {
            document.documentElement.dataset.capture = event.data.type;
            document.documentElement.dataset.captureError = event.data.error ?? "";
          }
        });
        window.postMessage(message, location.origin);
      }, JSON.stringify(configure));
      await expect(page.locator("html")).toHaveAttribute("data-capture", "rendered");
      if (meta.category === "dialogs") {
        await expect(page.getByRole("dialog", { includeHidden: true })).toBeVisible();
      }
      await page.waitForLoadState("networkidle");
      // Center short components like the live cards; tall content stays top-aligned.
      if (meta.category === "components") {
        await page.evaluate(() => {
          const host = document.querySelector("knx-gallery-preview")!;
          const offset = Math.max(0, (innerHeight - host.getBoundingClientRect().height) / 2);
          (host as HTMLElement).style.transform = `translateY(${offset}px)`;
          document.body.style.background = getComputedStyle(host).backgroundColor;
        });
      }
      const screenshot = await page.screenshot({
        path: resolve(output, `${meta.id}-${mode}.png`),
        animations: "disabled",
      });
      if (meta.id === "knx-group-monitor" && mode === "light") {
        // Cross the fixture's 1200ms telemetry interval: a thumbnail must stay still
        // even when capture runs on a slow CI worker.
        await page.waitForTimeout(1300);
        expect((await page.screenshot({ animations: "disabled" })).equals(screenshot)).toBe(true);
      }
      expect(failures).toEqual([]);
      await expect(page.locator("html")).toHaveAttribute("data-capture", "rendered");
    });
  }
}
