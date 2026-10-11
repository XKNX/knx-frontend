/* eslint-disable no-await-in-loop -- benchmark samples must run consecutively to measure cold load and return. */
import { expect, test } from "@playwright/test";
import { catalog } from "../src/catalog";

test("static overview benchmark reports initial load and nearby return", async ({ page }) => {
  test.setTimeout(120_000);
  const samples: { initialMs: number; returnMs: number; reused: boolean; frames: number }[] = [];
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    await page.goto("./");
    const cards = page.locator(".overview-card");
    await expect(cards).toHaveCount(catalog.length);
    const visible = await cards.evaluateAll((elements) =>
      elements.flatMap((element, index) => {
        const rect = element.getBoundingClientRect();
        return rect.top < innerHeight && rect.bottom > 0 ? [index] : [];
      }),
    );
    await Promise.all(
      visible.map((index) =>
        expect(cards.nth(index).locator('[data-state="ready"]')).toBeVisible({ timeout: 30_000 }),
      ),
    );
    const initialMs = Math.round(performance.now() - start);
    const first = cards.first();
    const source = await first.locator("img").getAttribute("src");
    await page.locator(".overview").evaluate((element) => {
      element.scrollTop = 480;
    });
    await expect(cards.nth(9).locator('[data-state="ready"]')).toBeVisible({ timeout: 30_000 });
    const back = performance.now();
    await page.locator(".overview").evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(first.locator('[data-state="ready"]')).toBeVisible({ timeout: 30_000 });
    samples.push({
      initialMs,
      returnMs: Math.round(performance.now() - back),
      reused: source === (await first.locator("img").getAttribute("src")),
      frames: await page.locator("iframe").count(),
    });
  }
  await test.info().attach("static-preview-benchmark", {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
});
