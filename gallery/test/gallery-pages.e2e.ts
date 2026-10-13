/* eslint-disable no-await-in-loop -- Verify sequential navigation in one browser session. */
import { expect, test } from "@playwright/test";
import { catalog } from "../src/catalog";
import { mockGalleryBrand } from "./brands";

test("production gallery keeps local assets and interactive previews within its Pages prefix", async ({
  page,
  baseURL,
}) => {
  const failures: string[] = [];
  const base = new URL(baseURL!);
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.route("**/*", async (route) => {
    if (await mockGalleryBrand(route)) return;
    const url = new URL(route.request().url());
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname) ||
      url.pathname.startsWith(`${base.pathname}api/`)
    ) {
      failures.push(url.href);
      await route.abort();
    } else await route.continue();
  });
  await page.goto("./");
  const catalogResponse = await page.request.get("catalog.json");
  expect(catalogResponse.status()).toBe(200);
  expect(await catalogResponse.json()).toContainEqual({
    id: "knx-single-address-selector",
    title: "Single address selector",
    covers: ["knx-single-address-selector"],
  });
  await expect(page.locator("knx-gallery-thumbnail")).toHaveCount(catalog.length);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("overview-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("overview-mobile.png") });
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (const mode of ["light", "dark"]) {
    for (const { meta } of catalog) {
      const response = await page.request.get(`thumbnails/${meta.id}-${mode}.png`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  }
  for (const id of ["knx-tabs-subpage-data", "knx-dpt-select-dialog", "knx-frontend"]) {
    await page.goto(`?component=${id}&scenario=default`);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const frame = page.locator("iframe").first();
    expect(new URL((await frame.getAttribute("src"))!).pathname).toBe(
      `${base.pathname}preview.html`,
    );
    expect(new URL(page.url()).pathname).toBe(base.pathname);
    if (id === "knx-dpt-select-dialog") {
      const preview = page.frameLocator("iframe");
      await preview.getByRole("button", { name: "Open dialog", exact: true }).click();
      await expect(preview.getByRole("dialog")).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("dialog-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: test.info().outputPath("dialog-mobile.png") });
      await page.setViewportSize({ width: 1600, height: 1000 });
    }
    if (id === "knx-frontend") {
      const preview = page.frameLocator("iframe");
      await preview.locator('a[href="/knx/entities"]').click();
      await expect(
        preview
          .locator("knx-entities-router")
          .getByRole("cell", { name: "Living room light", exact: true }),
      ).toBeVisible();
      const url = new URL(
        page
          .frames()
          .find((item) => item.url().includes("preview.html"))!
          .url(),
      );
      expect(url.pathname).toBe(`${base.pathname}preview.html`);
      expect(url.hash).toBe("#/knx/entities/view");
    }
  }
  expect(failures).toEqual([]);
});
