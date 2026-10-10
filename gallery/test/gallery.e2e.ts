import { expect, test as base, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { catalog, catalogGroups } from "../src/catalog";
import { mockGalleryBrand } from "./brands";

// Every browser test fails on real console/page errors or accidental backend traffic.
const test = base.extend<{ checkedPage: undefined; expectedRequestFailures: Set<string> }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments.
  expectedRequestFailures: async ({}, use) => use(new Set()),
  checkedPage: [
    async ({ page, baseURL, expectedRequestFailures }, use) => {
      const failures: string[] = [];
      const gallery = new URL(baseURL!);
      // Same-origin traffic must stay below the gallery base path and never reach the HA API.
      const unexpected = (url: URL) =>
        url.origin !== gallery.origin ||
        !url.pathname.startsWith(gallery.pathname) ||
        url.pathname.startsWith(`${gallery.pathname}api/`);
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          const expectedFixtureFailure =
            new URL(page.url()).searchParams.get("scenario") === "fetch-error" &&
            message.text().includes("The local fixture could not be loaded.");
          const expectedResourceFailure =
            expectedRequestFailures.has(message.location().url) &&
            message.text().startsWith("Failed to load resource:");
          if (!expectedFixtureFailure && !expectedResourceFailure) failures.push(message.text());
        }
      });
      await page.route("**/*", async (route) => {
        if (await mockGalleryBrand(route)) return;
        const url = new URL(route.request().url());
        if (unexpected(url)) {
          failures.push(`Unexpected request: ${url.href}`);
          await route.abort();
        } else await route.continue();
      });
      await page.routeWebSocket(/.*/, async (socket) => {
        const url = new URL(socket.url());
        url.protocol = url.protocol === "wss:" ? "https:" : "http:";
        if (unexpected(url)) {
          failures.push(`Unexpected WebSocket: ${url.href}`);
          await socket.close();
        } else socket.connectToServer();
      });
      page.on("response", (response) => {
        if (response.status() >= 400 && !expectedRequestFailures.has(response.url())) {
          failures.push(`${response.status()}: ${response.url()}`);
        }
      });
      await use(undefined);
      expect(failures).toEqual([]);
    },
    { auto: true },
  ],
});

for (const [source, path] of [
  ["document", /\/preview\.html(?:\?|$)/],
  ["script", /\/preview\.[^/]+\.js(?:\?|$)/],
] as const) {
  test(`preview bootstrap ${source} failure reports an error and reset recovers`, async ({
    page,
    expectedRequestFailures,
  }) => {
    await page.clock.install();
    await page.route(path, async (route) => {
      expectedRequestFailures.add(route.request().url());
      await route.fulfill({ status: 404, contentType: "text/html", body: "Not found" });
    });
    await page.goto("./?component=knx-single-address-selector&scenario=default");
    await expect.poll(() => expectedRequestFailures.size).toBeGreaterThan(0);
    await expect(page.getByRole("status")).toHaveText("Loading preview…");
    await page.clock.fastForward(31_000);
    await expect(page.getByRole("alert")).toHaveText("The component preview could not be loaded.");
    await expect(page.getByRole("status")).toContainText("Preview failed");
    await expect(
      page.locator("knx-gallery-event-log li").filter({ hasText: "error:" }),
    ).toHaveCount(1);
    await page.unroute(path);
    await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    await page.clock.fastForward(31_000);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("preview bootstrap timeout allows a late ready without resetting healthy Compare peers", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route(/\/preview\.html\?.*pane=comparison/, async (route) => {
    waiting = true;
    await held;
    await route.fallback();
  });
  try {
    await page.getByRole("button", { name: /^Compare/ }).click();
    await expect.poll(() => waiting).toBe(true);
    await page.clock.fastForward(31_000);
    const light = page.locator('.preview-card[data-preview-key="phone:primary"]');
    const dark = page.locator('.preview-card[data-preview-key="phone:comparison"]');
    await expect(light.getByRole("status")).toHaveText("Preview ready");
    await expect(dark.getByRole("alert")).toBeVisible();
    await page.frameLocator('iframe[data-pane="primary"]').locator("input").fill("1/2/90");
    release();
    await expect(dark.getByRole("status")).toHaveText("Preview ready");
    await expect(dark.getByRole("alert")).toHaveCount(0);
    await expect(page.frameLocator('iframe[data-pane="comparison"]').locator("input")).toHaveValue(
      "1/2/90",
    );
  } finally {
    release();
  }
});

test("preview bootstrap timeout preserves an error reported before ready", async ({ page }) => {
  await page.clock.install();
  await page.route(/\/preview\.html(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><script>
        parent.postMessage({
          channel: "knx-gallery",
          sessionId: new URL(location.href).searchParams.get("session"),
          type: "error",
          error: "Preview startup failed"
        }, location.origin);
      </script>`,
    }),
  );
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await expect(page.getByRole("alert")).toHaveText("Preview startup failed");
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("alert")).toHaveText("Preview startup failed");
  await expect(page.locator("knx-gallery-event-log li").filter({ hasText: "error:" })).toHaveCount(
    1,
  );
});

test("preview bootstrap timers cannot fail a replacement session", async ({ page }) => {
  await page.clock.install();
  await page.route(/\/preview\.html(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Unavailable preview</title>",
    }),
  );
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Loading preview…");
  await page.clock.fastForward(15_000);
  await page.unroute(/\/preview\.html(?:\?|$)/);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("knx-gallery-event-log li").filter({ hasText: "error:" })).toHaveCount(
    0,
  );
});

test("preview bootstrap timers stop when a loading Compare pane is removed", async ({ page }) => {
  await page.clock.install();
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.route(/\/preview\.html\?.*pane=comparison/, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Unavailable preview</title>",
    }),
  );
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.getByRole("status").nth(1)).toHaveText("Loading preview…");
  await page.clock.fastForward(15_000);
  await page.getByRole("button", { name: /^Light/ }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("knx-gallery-event-log li").filter({ hasText: "error:" })).toHaveCount(
    0,
  );
});

test("preview bootstrap timers stop on disconnect and reconnected Gallery can load", async ({
  page,
}) => {
  await page.clock.install();
  const path = /\/preview\.html(?:\?|$)/;
  await page.route(path, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Unavailable preview</title>",
    }),
  );
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Loading preview…");
  const gallery = await page.locator("knx-component-gallery").elementHandle();
  await gallery!.evaluate((element) => element.remove());
  await page.clock.fastForward(31_000);
  expect(
    await gallery!.evaluate(
      (element) => element.shadowRoot!.querySelectorAll('[role="alert"]').length,
    ),
  ).toBe(0);
  await page.unroute(path);
  await gallery!.evaluate((element) => document.body.append(element));
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("dashboard loads light and dark brands from the placeholder-enabled CDN", async ({ page }) => {
  await page.goto("./?component=knx-dashboard&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]').locator("img.logo");
  const dark = page.frameLocator('iframe[data-pane="comparison"]').locator("img.logo");
  await expect(light).toHaveAttribute("src", "https://brands.home-assistant.io/_/knx/icon.png");
  await expect(dark).toHaveAttribute("src", "https://brands.home-assistant.io/_/knx/dark_icon.png");
  await Promise.all(
    [light, dark].map(async (image) => {
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBeGreaterThan(0);
    }),
  );
});

// HA toggle visuals cover their native inputs; exercise their keyboard contract.
async function setChecked(toggle: Locator, checked: boolean) {
  if ((await toggle.isChecked()) !== checked) await toggle.press("Space");
  await expect(toggle).toBeChecked({ checked });
}

// HA assigns focus while opening; wait before typing or clicking dialog controls.
async function openAnimatedDialog(
  preview: FrameLocator,
  opener = preview.getByRole("button", { name: "Open dialog", exact: true }),
) {
  await preview.locator("body").evaluate((element) => {
    element.removeAttribute("data-test-dialog-ready");
    element.addEventListener(
      "after-show",
      () => element.setAttribute("data-test-dialog-ready", ""),
      { once: true },
    );
  });
  await opener.click();
  await expect(preview.locator("body")).toHaveAttribute("data-test-dialog-ready", "");
}

test("multi-device selection keeps canonical widths and the final device", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await expect(page.locator("iframe")).toHaveCount(3);
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluateAll((frames) =>
          frames.map((frame) => (frame as HTMLIFrameElement).contentWindow!.innerWidth),
        ),
    )
    .toEqual([390, 768, 1280]);
  await page.getByRole("button", { name: /^Tablet · 768/ }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await expect(page.locator("iframe")).toHaveCount(1);
  await page
    .getByRole("button", { name: /^Desktop · 1280/ })
    .dispatchEvent("click", { ctrlKey: true });
  await expect(page.locator("iframe")).toHaveCount(2);
  const width = page.getByRole("spinbutton", { name: "Preview width (px)", exact: true });
  await width.fill("820");
  await width.press("Tab");
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect
    .poll(() =>
      page.locator("iframe").evaluate((el: HTMLIFrameElement) => el.contentWindow!.innerWidth),
    )
    .toBe(820);
  await width.fill("0");
  await width.press("Tab");
  await expect
    .poll(() =>
      page.locator("iframe").evaluate((el: HTMLIFrameElement) => el.contentWindow!.innerWidth),
    )
    .toBe(820);
});

test("multi-device presets expose accessible toggle state", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await expect(page.getByRole("button", { name: /^Phone · 390/, pressed: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Desktop · 1280/, pressed: false })).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await expect(page.getByRole("button", { name: /^Desktop · 1280/, pressed: true })).toHaveCount(1);
  await page.getByRole("button", { name: /^Tablet · 768/ }).click();
  await expect(page.getByRole("button", { name: /^Phone · 390/, pressed: false })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Tablet · 768/, pressed: true })).toHaveCount(1);
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await expect(page.getByRole("button", { name: /^Tablet · 768/, pressed: true })).toHaveCount(1);
});

test("multi-device late joins preserve inputs and removed sources are ignored", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  const phone = page.frameLocator('iframe[data-device="phone"][data-pane="primary"]');
  await phone.locator("input").fill("1/2/30");
  await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
    frame.dataset.retained = "true";
    const source = frame.contentWindow;
    const sessionId = new URL(frame.src).searchParams.get("session");
    document.body.addEventListener(
      "gallery-stale",
      () =>
        window.dispatchEvent(
          new MessageEvent("message", {
            source,
            origin: location.origin,
            data: {
              channel: "knx-gallery",
              sessionId,
              type: "event",
              event: { kind: "event", name: "Stale pane", timestamp: Date.now(), args: null },
            },
          }),
        ),
      { once: true },
    );
  });
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await expect(page.locator('iframe[data-device="phone"]')).toHaveAttribute(
    "data-retained",
    "true",
  );
  const desktop = page.frameLocator('iframe[data-device="desktop"][data-pane="primary"]');
  await expect(desktop.locator("input")).toHaveValue("1/2/30");
  await desktop.locator("input").fill("1/2/31");
  await expect(phone.locator("input")).toHaveValue("1/2/31");
  const session = await page.locator('iframe[data-device="desktop"]').getAttribute("src");
  await page.getByRole("button", { name: /^Phone · 390/ }).click({ modifiers: ["Meta"] });
  await page.evaluate(() => document.body.dispatchEvent(new Event("gallery-stale")));
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "Stale pane" }),
  ).toHaveCount(0);
  await expect(desktop.locator("input")).toHaveValue("1/2/31");
  await expect(page.locator('iframe[data-device="desktop"]')).toHaveAttribute("src", session!);
});

test("multi-device compare shares six panes and transfers primary code", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  const primary = page.locator('iframe[data-device="phone"][data-pane="primary"]');
  const session = await primary.getAttribute("src");
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.locator("iframe")).toHaveCount(6);
  await expect(primary).toHaveAttribute("src", session!);
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  await source.locator("ha-input-search input").fill("six panes");
  await Promise.all(
    ["phone", "tablet", "desktop"].flatMap((device) =>
      ["primary", "comparison"].map((pane) =>
        expect(
          page
            .frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`)
            .locator("ha-input-search input"),
        ).toHaveValue("six panes"),
      ),
    ),
  );
  await page.getByRole("button", { name: /^Phone · 390/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Split/ }).click();
  await expect(page.locator(".code-panel")).toHaveCount(1);
  await expect(page.locator(".code-panel code")).toContainText("knx-tabs-subpage-data");
  await page.getByRole("button", { name: /^Dark/ }).click();
  await expect(page.locator("iframe")).toHaveCount(2);
  await expect(
    page
      .frameLocator('iframe[data-device="desktop"][data-pane="primary"]')
      .locator("ha-input-search input"),
  ).toHaveValue("six panes");
});

test.describe("multi-device touch menu", () => {
  test.use({ hasTouch: true });
  test("multi-device menu supports keyboard and touch selection", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./?component=knx-single-address-selector&scenario=default");
    await page.locator(".device-menu").getByRole("button").click();
    const tablet = page.getByRole("menuitemcheckbox", { name: "Tablet · 768 px", exact: true });
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Phone · 390 px", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(tablet).toBeChecked();
    await expect(tablet).toBeVisible();
    await page.getByRole("menuitemcheckbox", { name: "Desktop · 1280 px", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(3);
    await page.getByRole("menuitemcheckbox", { name: "Phone · 390 px", exact: true }).click();
    await tablet.click();
    const desktop = page.getByRole("menuitemcheckbox", { name: "Desktop · 1280 px", exact: true });
    await desktop.click();
    await expect(desktop).toBeChecked();
    await expect(page.locator("iframe")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(desktop).toBeHidden();
  });
});

async function expectBoardFits(page: Page) {
  await expect
    .poll(() =>
      page.locator(".canvas").evaluate((surface) => {
        const board = surface.querySelector(".canvas-board")!;
        const outer = surface.getBoundingClientRect();
        const inner = board.getBoundingClientRect();
        return (
          inner.left >= outer.left + 23 &&
          inner.top >= outer.top + 23 &&
          inner.right <= outer.right - 23 &&
          inner.bottom <= outer.bottom - 23
        );
      }),
    )
    .toBe(true);
}

test("compare changes from columns to rows without replacing active previews", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  const primary = page.locator('iframe[data-device="phone"][data-pane="primary"]');
  const original = await primary.elementHandle();
  await page.frameLocator('iframe[data-device="phone"]').locator("input").fill("1/2/42");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const geometry = () =>
    page.locator(".preview-card").evaluateAll((cards) =>
      cards.map((card) => {
        const { x, y, right, bottom } = card.getBoundingClientRect();
        return { x, y, right, bottom };
      }),
    );
  const expectColumns = async () => {
    await expect(page.locator(".preview-card")).toHaveCount(2);
    await expect
      .poll(async () => {
        const [light, dark] = await geometry();
        return light.y === dark.y && dark.x > light.right;
      })
      .toBe(true);
    await expectBoardFits(page);
  };
  await expectColumns();
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await expect(page.locator(".preview-card")).toHaveCount(4);
  await expect
    .poll(async () => {
      const [phone, tablet, darkPhone, darkTablet] = await geometry();
      return (
        phone.y === tablet.y &&
        darkPhone.y === darkTablet.y &&
        darkPhone.x === phone.x &&
        darkTablet.x === tablet.x &&
        darkPhone.y > Math.max(phone.bottom, tablet.bottom)
      );
    })
    .toBe(true);
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await expectColumns();
  expect(await primary.evaluate((frame, before) => frame === before, original)).toBe(true);
  await expect(
    page.frameLocator('iframe[data-device="phone"][data-pane="primary"]').locator("input"),
  ).toHaveValue("1/2/42");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectColumns();
});

test("canvas board aligns six panes without changing viewport geometry", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-separator&scenario=expanded");
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.locator(".canvas-board .preview-card")).toHaveCount(6);
  await expectBoardFits(page);
  const geometry = await page.locator(".preview-card").evaluateAll((cards) =>
    cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { x: rect.x, y: rect.y, bottom: rect.bottom };
    }),
  );
  expect(geometry.slice(0, 3).map((rect) => rect.y)).toEqual(Array(3).fill(geometry[0].y));
  expect(geometry.slice(3).map((rect) => rect.x)).toEqual(
    geometry.slice(0, 3).map((rect) => rect.x),
  );
  expect(geometry[3].y).toBeGreaterThan(
    Math.max(...geometry.slice(0, 3).map((rect) => rect.bottom)),
  );
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluateAll((frames) =>
          frames.map((frame) => (frame as HTMLIFrameElement).contentWindow!.innerWidth),
        ),
    )
    .toEqual([390, 768, 1280, 390, 768, 1280]);
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectBoardFits(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("canvas zoom preserves center and hidden-stage geometry", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.frameLocator('iframe[data-device="phone"]').locator("input").fill("1/2/42");
  await page.getByRole("button", { name: "100%", exact: true }).click();
  const center = () =>
    page.locator(".canvas").evaluate((surface) => {
      const board = surface.querySelector<HTMLElement>(".canvas-board")!;
      const scale = board.getBoundingClientRect().width / board.offsetWidth;
      return (surface.scrollLeft + surface.clientWidth / 2 - board.offsetLeft) / scale;
    });
  const before = await center();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(center).toBeCloseTo(before, 0);
  await page.locator(".view-mode-menu").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Code", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".view-mode-menu").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Preview", exact: true }).click();
  await expect(page.locator(".canvas-navigation .zoom-value")).toHaveText("110%");
  await expect(page.frameLocator('iframe[data-device="phone"]').locator("input")).toHaveValue(
    "1/2/42",
  );
  await page
    .locator(".canvas-toolbar")
    .getByRole("button", { name: "Preview options", exact: true })
    .click();
  const width = page
    .locator(".preview-options")
    .getByRole("spinbutton", { name: "Preview width (px)", exact: true });
  await width.fill("10000");
  await width.press("Tab");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  await expectBoardFits(page);
  await expect
    .poll(() =>
      page
        .locator(".canvas-board")
        .evaluate((board: HTMLElement) => board.getBoundingClientRect().width / board.offsetWidth),
    )
    .toBeLessThan(0.1);
});

async function openThreeDeviceCanvas(page: Page) {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.locator(".preview-context [role=status]")).toHaveText(
    Array(6).fill("Preview ready"),
  );
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
}

test("canvas panning crosses iframe edges and cancels cleanly", async ({ page }) => {
  await openThreeDeviceCanvas(page);
  const surface = page.locator(".canvas");
  await surface.evaluate((el) => {
    el.scrollLeft = 400;
    el.scrollTop = 100;
  });
  const box = (await surface.boundingBox())!;
  const initial = await surface.evaluate((el) => el.scrollLeft);
  await page.mouse.move(box.x + 28, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x - 72, box.y + 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => surface.evaluate((el) => el.scrollLeft)).toBeCloseTo(initial + 100, 0);
  const frame = page.locator('iframe[data-device="tablet"][data-pane="primary"]');
  const session = await frame.getAttribute("src");
  for (const percent of [50, 100, 200]) {
    // Sequential zoom/gesture transitions exercise a retained iframe.
    // eslint-disable-next-line no-await-in-loop
    await page.getByRole("button", { name: "100%", exact: true }).click();
    for (let step = 0; step < Math.abs(percent - 100) / 10; step++) {
      // eslint-disable-next-line no-await-in-loop
      await page
        .getByRole("button", { name: percent < 100 ? "Zoom out" : "Zoom in", exact: true })
        .click();
    }
    // eslint-disable-next-line no-await-in-loop
    await surface.evaluate((el, zoom) => {
      el.scrollLeft = 416 * zoom;
      el.scrollTop = 0;
    }, percent / 100);
    // eslint-disable-next-line no-await-in-loop
    await page
      .frameLocator('iframe[data-device="tablet"][data-pane="primary"]')
      .locator("body")
      .evaluate((body) => {
        body.tabIndex = -1;
        body.focus();
      });
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.down("Space");
    // eslint-disable-next-line no-await-in-loop
    await expect(surface).toHaveAttribute("data-pan-ready", "");
    // eslint-disable-next-line no-await-in-loop
    await expect(
      page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]').locator("body"),
    ).toHaveCSS("cursor", "grab");
    // eslint-disable-next-line no-await-in-loop
    const before = await surface.evaluate((el) => el.scrollLeft);
    // eslint-disable-next-line no-await-in-loop
    const rect = (await frame.boundingBox())!;
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.move(Math.max(rect.x, box.x) + 40, Math.max(rect.y, box.y) + 220);
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.down();
    // eslint-disable-next-line no-await-in-loop
    await expect(
      page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]').locator("body"),
    ).toHaveCSS("cursor", "grabbing");
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.move(Math.max(rect.x, box.x) - 60, Math.max(rect.y, box.y) + 220, {
      steps: 5,
    });
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.up();
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.up("Space");
    // eslint-disable-next-line no-await-in-loop
    await expect.poll(() => surface.evaluate((el) => el.scrollLeft)).toBeCloseTo(before + 100, 0);
    // eslint-disable-next-line no-await-in-loop
    await expect(surface).not.toHaveAttribute("data-panning", "");
    // eslint-disable-next-line no-await-in-loop
    await expect(
      page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]').locator("body"),
    ).toHaveCSS("cursor", "auto");
  }
  await expect(frame).toHaveAttribute("src", session!);
  await expect
    .poll(() => frame.evaluate((el: HTMLIFrameElement) => el.contentWindow!.innerWidth))
    .toBe(768);
  await expect(page.locator("knx-gallery-event-log li")).toHaveCount(0);
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  const input = page
    .frameLocator('iframe[data-device="tablet"][data-pane="primary"]')
    .locator("input");
  await input.fill("1/2/70");
  await expect(
    page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]').locator("input"),
  ).toHaveValue("1/2/70");
});

test("canvas panning preserves focused controls and alignment actions", async ({ page }) => {
  await openThreeDeviceCanvas(page);
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  const surface = page.locator(".canvas");
  const source = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
  await source.locator("input").fill("1/2/80");
  await source.locator("input").press("Space");
  await expect(source.locator("input")).toHaveValue("1/2/80 ");
  await expect(surface).not.toHaveAttribute("data-pan-ready", "");
  for (const cancel of ["Escape", "keyup", "blur", "pointercancel", "lostpointercapture"]) {
    // eslint-disable-next-line no-await-in-loop
    await source.locator("body").evaluate((body) => {
      body.tabIndex = -1;
      body.focus();
    });
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.down("Space");
    // eslint-disable-next-line no-await-in-loop
    await expect(surface).toHaveAttribute("data-pan-ready", "");
    // eslint-disable-next-line no-await-in-loop
    const rect = (await page
      .locator('iframe[data-device="tablet"][data-pane="primary"]')
      .boundingBox())!;
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.75);
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.down();
    // eslint-disable-next-line no-await-in-loop
    await expect(surface).toHaveAttribute("data-panning", "");
    if (cancel === "Escape") {
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press("Escape");
    } else if (cancel === "keyup") {
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.up("Space");
    } else {
      // eslint-disable-next-line no-await-in-loop
      await source.locator("body").evaluate((body, event) => {
        if (event === "blur") window.dispatchEvent(new Event("blur"));
        else body.dispatchEvent(new PointerEvent(event, { bubbles: true, pointerId: 1 }));
      }, cancel);
    }
    // eslint-disable-next-line no-await-in-loop
    await expect(surface).not.toHaveAttribute("data-pan-ready", "");
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.up();
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.up("Space");
  }
  await page
    .locator(".canvas-toolbar")
    .getByRole("button", { name: "Preview options", exact: true })
    .click();
  await page
    .locator(".preview-options")
    .getByRole("button", { name: /^Inspect alignment/ })
    .click();
  await expect(page.locator(".preview-options")).toBeHidden();
  await expect(source.locator("[data-gallery-guides]")).toHaveCount(1);
  await source.locator("input").click();
  await expect(source.locator('[data-gallery-guides] [data-kind="fixed"]')).toHaveCount(1);
  await source.locator("body").evaluate((body) => body.focus());
  await page.keyboard.down("Space");
  await expect(surface).not.toHaveAttribute("data-pan-ready", "");
  await page.keyboard.up("Space");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(source.locator('[data-gallery-guides] [data-kind="fixed"] line')).toHaveCount(4);
  await page.getByRole("button", { name: "Exit inspection", exact: true }).click();
  await source.locator("input").fill("1/2/81");
  await expect(
    page.frameLocator('iframe[data-device="phone"][data-pane="primary"]').locator("input"),
  ).toHaveValue("1/2/81");
  await source.getByRole("button", { name: "Search group address", exact: true }).press("Space");
  await expect(
    source.locator("knx-ga-select-dialog").getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  await source
    .locator("knx-ga-select-dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    source.locator("knx-ga-select-dialog").getByRole("button", { name: "Cancel", exact: true }),
  ).toBeHidden();
  await source.locator("body").evaluate((body) => body.focus());
  await page.keyboard.down("Space");
  const rect = (await page
    .locator('iframe[data-device="tablet"][data-pane="primary"]')
    .boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 0.75);
  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-panning", "");
  await page
    .getByRole("button", { name: /^Tablet · 768/ })
    .dispatchEvent("click", { metaKey: true });
  await expect(page.locator('iframe[data-device="tablet"]')).toHaveCount(0);
  await expect(surface).not.toHaveAttribute("data-panning", "");
  await expect(surface).not.toHaveAttribute("data-pan-ready", "");
  await page.mouse.up();
  await page.keyboard.up("Space");
  await page
    .frameLocator('iframe[data-device="phone"][data-pane="primary"]')
    .locator("input")
    .fill("1/2/82");
  await expect(
    page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]').locator("input"),
  ).toHaveValue("1/2/82");
});

test("canvas panning preserves Space selection in HA radio controls", async ({ page }) => {
  await page.goto("./?component=knx-dpt-option-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill("");
  const radio = page.frameLocator("iframe").getByRole("radio", { name: /DPT 1\.001/ });
  await expect(radio).not.toBeChecked();
  await radio.focus();
  await page.keyboard.down("Space");
  await expect(page.locator(".canvas")).not.toHaveAttribute("data-pan-ready", "");
  await expect(radio).toBeChecked();
  await page.keyboard.up("Space");
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "value-changed" }),
  ).toHaveCount(1);
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "value-changed" }),
  ).toContainText('"value": "1.001"');
});

test("canvas panning leaves preview and background wheel scrolling native", async ({ page }) => {
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("spinbutton", { name: "Height (px)", exact: true }).fill("2000");
  await page.getByRole("button", { name: /^Compare/ }).click();
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const surface = page.locator(".canvas");
  await expect
    .poll(() => surface.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await surface.evaluate((element) => {
    element.scrollTop = 0;
  });
  const preview = page.frameLocator('iframe[data-pane="primary"]');
  await expect(preview.locator("knx-separator")).toHaveCSS("height", "2000px");
  const frame = (await page.locator('iframe[data-pane="primary"]').boundingBox())!;
  await page.mouse.move(frame.x + frame.width / 2, frame.y + 100);
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => preview.locator("body").evaluate(() => document.scrollingElement!.scrollTop))
    .toBeGreaterThan(0);
  expect(await surface.evaluate((element) => element.scrollTop)).toBe(0);
  const internal = await preview
    .locator("body")
    .evaluate(() => document.scrollingElement!.scrollTop);
  const canvas = (await surface.boundingBox())!;
  await page.mouse.move(canvas.x + 8, canvas.y + 8);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await preview.locator("body").evaluate(() => document.scrollingElement!.scrollTop)).toBe(
    internal,
  );
});

test("multi-device pane failure leaves healthy peers usable", async ({ page }) => {
  await openThreeDeviceCanvas(page);
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  const frame = page.locator('iframe[data-device="phone"][data-pane="comparison"]');
  const session = await frame.getAttribute("src");
  await frame.evaluate((el: HTMLIFrameElement) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: el.contentWindow,
        data: {
          channel: "knx-gallery",
          sessionId: new URL(el.src).searchParams.get("session"),
          type: "error",
          error: "Example pane failed",
        },
      }),
    ),
  );
  await expect(
    page.locator('.preview-card[data-preview-key="phone:comparison"] [role=alert]'),
  ).toHaveText("Example pane failed");
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "Example pane failed" }),
  ).toHaveCount(1);
  await page
    .frameLocator('iframe[data-device="tablet"][data-pane="primary"]')
    .locator("input")
    .fill("1/2/90");
  await expect(
    page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]').locator("input"),
  ).toHaveValue("1/2/90");
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(frame).not.toHaveAttribute("src", session!);
  await expect(page.locator(".preview-context [role=status]")).toHaveText(
    Array(6).fill("Preview ready"),
  );
  await expect(page.locator(".preview-card [role=alert]")).toHaveCount(0);
});

test("multi-device canvas visual QA", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.locator(".preview-context [role=status]")).toHaveText(
    Array(6).fill("Preview ready"),
  );
  await expectBoardFits(page);
  await page.screenshot({
    path: test.info().outputPath("six-panes-light-fit.png"),
    animations: "disabled",
  });
  await page
    .locator(".catalog-footer")
    .getByRole("button", { name: /^Switch application/ })
    .click();
  await page.screenshot({
    path: test.info().outputPath("six-panes-dark-fit.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: /^Split/ }).click();
  await expectBoardFits(page);
  await page.screenshot({
    path: test.info().outputPath("six-panes-split.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: /^Preview/ })
    .first()
    .click();
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: test.info().outputPath("six-panes-1280-original.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  await page.locator(".heading .catalog-toggle").click();
  await expectBoardFits(page);
  await page.screenshot({
    path: test.info().outputPath("six-panes-hidden-catalog.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectBoardFits(page);
  await page.screenshot({
    path: test.info().outputPath("six-panes-mobile.png"),
    animations: "disabled",
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("project links open separately and Escape keeps the mobile catalog open", async ({
  page,
  context,
}) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const frame = page.locator("iframe");
  const session = await frame.getAttribute("src");
  const trigger = page.getByRole("button", { name: "Project links", exact: true });
  await trigger.press("Enter");
  const links = page.locator(".project-links a");
  await expect(links).toHaveCount(4);
  const urls = [
    "https://github.com/XKNX/knx-frontend",
    "https://github.com/XKNX",
    "https://www.home-assistant.io/integrations/knx/",
    "https://github.com/XKNX/knx-integration",
  ];
  await Promise.all(
    urls.map((url, index) =>
      Promise.all([
        expect(links.nth(index)).toBeVisible(),
        expect(links.nth(index)).toHaveAttribute("href", url),
        expect(links.nth(index)).toHaveAttribute("target", "_blank"),
        expect(links.nth(index)).toHaveAttribute("rel", "noopener noreferrer"),
      ]),
    ),
  );
  await context.route(urls[0], (route) => route.fulfill({ body: "Project repository" }));
  const opened = page.waitForEvent("popup");
  await links.first().press("Enter");
  const popup = await opened;
  await expect(popup).toHaveURL(urls[0]);
  await popup.close();
  await expect(links.first()).toBeHidden();
  await expect(frame).toHaveAttribute("src", session!);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Open catalog", exact: true }).click();
  await trigger.click();
  await expect(links.last()).toBeVisible();
  const box = (await links.last().boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await links.first().press("Escape");
  await expect(links.first()).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Catalog", exact: true })).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("catalog shows both names and relationship links navigate in both directions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const catalogLink = page
    .getByRole("navigation", { name: "Catalog" })
    .getByRole("link", { name: "Tabs subpage data knx-tabs-subpage-data", exact: true });
  await expect(catalogLink).toContainText("Tabs subpage data");
  await expect(catalogLink).toContainText("knx-tabs-subpage-data");
  const relations = page.getByRole("region", { name: "Relationships", exact: true });
  await expect(relations).toContainText("Used internally");
  await expect(relations).toContainText("Can use in a slot");
  await expect(relations).toContainText("Arranges search and actions in the toolbar.");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await relations.getByRole("link", { name: "knx-tabs-subpage-data-toolbar", exact: true }).click();
  await expect(page).toHaveURL(/component=knx-tabs-subpage-data-toolbar/);
  await expect(page.locator(".heading h2")).toBeFocused();
  await expect(relations).toContainText("Used by");
  await expect(
    page.getByRole("spinbutton", { name: "Preview width (px)", exact: true }),
  ).toHaveValue("1280");
  await relations.getByRole("link", { name: "knx-tabs-subpage-data", exact: true }).click();
  await relations.getByRole("link", { name: "knx-list-filter", exact: true }).click();
  await expect(relations).toContainText("Can be placed in");
  await expect(relations.getByRole("link", { name: "knx-sort-menu", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/component=knx-tabs-subpage-data/);
});

test(
  "component names and relationships stay usable on a narrow screen",
  { tag: "@mobile" },
  async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
    await page.locator(".heading .catalog-toggle").click();
    const longName = page.getByRole("navigation", { name: "Catalog" }).getByRole("link", {
      name: "Telegram information dialog knx-group-monitor-telegram-info-dialog",
      exact: true,
    });
    await longName.scrollIntoViewIfNeeded();
    await expect(longName).toContainText("knx-group-monitor-telegram-info-dialog");
    expect(await longName.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator(".heading .catalog-toggle").click();
    await page.getByRole("button", { name: "Open inspector", exact: true }).click();
    await page
      .getByRole("region", { name: "Relationships", exact: true })
      .getByRole("link", { name: "knx-tabs-subpage-data-toolbar", exact: true })
      .click();
    await expect(page).toHaveURL(/component=knx-tabs-subpage-data-toolbar/);
    await expect(page.getByRole("button", { name: "Open inspector", exact: true })).toBeVisible();
  },
);

test("scenario tabs navigate directly without moving the canvas", async ({ page }) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const tabs = page.locator("#scenario-tabs");
  await expect(tabs.getByRole("tab")).toHaveText(["Default", "Filters", "Minimal"]);
  await expect(page.locator("#gallery-scenario")).toBeHidden();
  const titleBox = (await page.locator(".heading h2").boundingBox())!;
  const tabBox = (await tabs.boundingBox())!;
  expect(Math.abs(titleBox.y + titleBox.height / 2 - tabBox.y - tabBox.height / 2)).toBeLessThan(4);
  expect(tabBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
  const before = (await page.locator(".canvas").boundingBox())!.y;
  const session = await page.locator("iframe").getAttribute("src");
  await tabs.getByRole("tab", { name: "Filters", exact: true }).click();
  await expect(page).toHaveURL(/scenario=filters$/);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(tabs.getByRole("tab", { name: "Filters", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("iframe")).not.toHaveAttribute("src", session!);
  expect((await page.locator(".canvas").boundingBox())!.y).toBe(before);
  const selectedSession = await page.locator("iframe").getAttribute("src");
  await tabs.getByRole("tab", { name: "Filters", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute("src", selectedSession!);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.locator("iframe")).not.toHaveAttribute("src", selectedSession!);
  await expect(page).toHaveURL(/scenario=filters$/);
  await page.goBack();
  await expect(tabs.getByRole("tab", { name: "Default", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page).toHaveURL(/scenario=default$/);
  await page.goForward();
  await expect(tabs.getByRole("tab", { name: "Filters", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.screenshot({
    path: test.info().outputPath("scenario-tabs-desktop.png"),
    animations: "disabled",
  });
});

test("scenario tabs scroll, retain the route on resize and use a mobile picker", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("./?component=knx-frontend&scenario=route-expose-create");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const tabs = page.locator("#scenario-tabs");
  const last = tabs.getByRole("tab", { name: "Create exposure", exact: true });
  await expect(last).toHaveAttribute("aria-selected", "true");
  await expect(last).toBeInViewport();
  await expect(tabs.locator(".scroll-button").filter({ visible: true })).not.toHaveCount(0);
  await last.press("Home");
  await expect(page).toHaveURL(/scenario=default$/);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(tabs.getByRole("tab", { name: "Default", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tabs.getByRole("tab", { name: "Default", exact: true }).press("End");
  await expect(page).toHaveURL(/scenario=route-expose-create$/);
  await expect(last).toBeInViewport();
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const session = await page.locator("iframe").getAttribute("src");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tabs).toBeHidden();
  await expect(page.locator("iframe")).toHaveAttribute("src", session!);
  await page.locator("#gallery-scenario ha-picker-field").click();
  await page
    .locator("#gallery-scenario")
    .getByRole("menuitem", { name: "Entities", exact: true })
    .click();
  await expect(page).toHaveURL(/scenario=route-entities$/);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(tabs.getByRole("tab", { name: "Entities", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goto("./?component=knx-tabs-subpage-data-toolbar&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(page.locator(".single-scenario")).toHaveText("Scenario: Default");
  await expect(page.locator("#scenario-tabs")).toHaveCount(0);
  await expect(page.locator("#gallery-scenario")).toHaveCount(0);
});

test("canvas Light, Dark and Compare share one selection without changing the application", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./?component=knx-separator&scenario=expanded");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const modes = page.getByRole("group", { name: /^Preview mode/ });
  await expect(modes.getByRole("button")).toHaveCount(3);
  const preview = page.frameLocator('iframe[data-pane="primary"]').locator("knx-gallery-preview");
  const session = await page.locator("iframe").getAttribute("src");
  await modes.getByRole("button", { name: /^Dark/ }).click();
  await expect(preview).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("knx-component-gallery")).toHaveCSS("color-scheme", "light");
  await modes.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.locator("iframe")).toHaveCount(2);
  await expect(preview).toHaveCSS("color-scheme", "light");
  await expect(
    page.frameLocator('iframe[data-pane="comparison"]').locator("knx-gallery-preview"),
  ).toHaveCSS("color-scheme", "dark");
  await modes.getByRole("button", { name: /^Dark/ }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(preview).toHaveCSS("color-scheme", "dark");
  await modes.getByRole("button", { name: /^Light/ }).click();
  await expect(preview).toHaveCSS("color-scheme", "light");
  const banner = page.getByRole("navigation", { name: "Catalog" });
  await banner
    .getByRole("button", { name: "Switch application to dark mode", exact: true })
    .click();
  await expect(page.locator("knx-component-gallery")).toHaveCSS("color-scheme", "dark");
  await expect(preview).toHaveCSS("color-scheme", "light");
  await banner
    .getByRole("button", { name: "Switch application to light mode", exact: true })
    .click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("knx-component-gallery")).toHaveCSS("color-scheme", "light");
  await expect(preview).toHaveCSS("color-scheme", "light");
  await expect(page.locator("iframe")).toHaveAttribute("src", session!);
  await expect(banner.getByRole("button", { name: /System/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("canvas-mode-selection.png") });
});

test("auto height follows content in both previews without changing width or session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-separator&scenario=expanded");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const auto = page.getByRole("button", { name: /^Auto height/ });
  await expect(auto).toBeVisible();
  const frame = page.locator('iframe[data-pane="primary"]');
  const session = await frame.getAttribute("src");
  await auto.click();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBe(50);
  expect((await frame.boundingBox())!.width).toBe(390);
  await page
    .getByRole("group", { name: /^Preview mode:/ })
    .getByRole("button", { name: /^Compare/ })
    .click();
  const comparison = page.locator('iframe[data-pane="comparison"]');
  await expect.poll(async () => (await comparison.boundingBox())!.height).toBe(50);
  const height = page.getByRole("spinbutton", { name: "Height (px)", exact: true });
  await height.fill("12");
  await height.press("Tab");
  await expect.poll(async () => (await frame.boundingBox())!.height).toBe(12);
  await expect.poll(async () => (await comparison.boundingBox())!.height).toBe(12);
  await expect(frame).toHaveAttribute("src", session!);
  await auto.click();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(240);
  await expect(frame).toHaveAttribute("src", session!);
});

test("auto height preserves values edited inside the preview", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-group-address-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const address = page.frameLocator("iframe").locator("knx-single-address-selector input").first();
  await address.fill("2/0/3");
  await address.press("Tab");
  const auto = page.getByRole("button", { name: /^Auto height/ });
  await auto.click();
  await expect(page.frameLocator("iframe").locator("knx-gallery-preview")).toHaveAttribute(
    "auto-height",
    "",
  );
  await expect(address).toHaveValue("2/0/3");
  await auto.click();
  await expect(page.frameLocator("iframe").locator("knx-gallery-preview")).not.toHaveAttribute(
    "auto-height",
    "",
  );
  await expect(address).toHaveValue("2/0/3");
});

test("auto height fits tabs subpage data content and gives its filter dialog room", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Auto height/ }).click();
  const frame = page.locator("iframe");
  const preview = page.frameLocator("iframe");
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThan(500);
  const compact = (await frame.boundingBox())!.height;
  expect(compact).toBeGreaterThan(150);
  await setChecked(page.getByRole("checkbox", { name: "Banner", exact: true }), false);
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThan(compact);
  const withoutBanner = (await frame.boundingBox())!.height;
  await preview.getByRole("button", { name: /^Filters/ }).click();
  await expect(preview.getByRole("dialog")).toBeVisible();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(compact);
  await preview.getByRole("button", { name: /Show 2 results/ }).click();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBe(withoutBanner);
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBe(1280);
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThan(500);
});

test("auto height stays available across components, full views and dialogs", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=flex-content-expansion-panel&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const auto = page.getByRole("button", { name: /^Auto height/ });
  await auto.click();
  const frame = page.locator("iframe");
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThan(240);
  const expanded = (await frame.boundingBox())!.height;
  await page.frameLocator("iframe").locator("flex-content-expansion-panel .header").click();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThan(expanded);
  await page.getByRole("link", { name: "Dashboard knx-dashboard", exact: true }).click();
  await expect(auto).toBeEnabled();
  await expect(auto).toHaveAccessibleName("Auto height · Selected");
  await expect(page.frameLocator("iframe").locator("knx-gallery-preview")).toHaveAttribute(
    "auto-height",
    "",
  );
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(240);
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(auto).toBeEnabled();
  await auto.click();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThan(100);
  const compact = (await frame.boundingBox())!.height;
  const preview = page.frameLocator("iframe");
  await preview.getByRole("button", { name: "Open dialog", exact: true }).click();
  await expect(preview.getByRole("dialog")).toBeVisible();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(240);
  await preview.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBe(compact);
  await expect(auto).toHaveAccessibleName("Auto height · Selected");
});

test("event log retains its height when events and expanded payloads arrive", async ({ page }) => {
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const dock = page.locator("knx-gallery-event-log");
  await dock.locator(".console-heading").click();
  const before = await dock.boundingBox();
  const inspectorBefore = (await page.locator(".inspector").boundingBox())!;
  expect(before!.x + before!.width).toBeLessThan(inspectorBefore.x);
  expect(
    Math.abs(inspectorBefore.y + inspectorBefore.height - before!.y - before!.height),
  ).toBeLessThan(2);
  await expect(page.getByText("Offline examples", { exact: true })).toHaveCount(0);
  const canvasBefore = await page.locator(".canvas").boundingBox();
  const frame = page.frames().find((item) => item.url().includes("preview.html"))!;
  await frame.evaluate(() => {
    for (let i = 0; i < 30; i++) {
      parent.postMessage(
        {
          channel: "knx-gallery",
          sessionId: new URL(location.href).searchParams.get("session"),
          type: "event",
          event: {
            kind: "event",
            name: `value-changed-${i}`,
            timestamp: Date.now(),
            args: { values: Array.from({ length: 100 }, (_, n) => n) },
          },
        },
        location.origin,
      );
    }
  });
  await expect(dock.locator("li")).toHaveCount(30);
  await expect(dock.locator("li").first()).toContainText("value-changed-29");
  await expect(dock.locator("li").last()).toContainText("value-changed-0");
  expect(await page.locator(".inspector").boundingBox()).toEqual(inspectorBefore);
  expect(await dock.boundingBox()).toEqual(before);
  const expanded = dock.locator("li").filter({ hasText: "value-changed-29" });
  await expanded.locator("summary").click();
  await frame.evaluate(() =>
    parent.postMessage(
      {
        channel: "knx-gallery",
        sessionId: new URL(location.href).searchParams.get("session"),
        type: "event",
        event: { kind: "event", name: "newest", timestamp: Date.now(), args: null },
      },
      location.origin,
    ),
  );
  await expect(dock.locator("li").first()).toContainText("newest");
  await expect(expanded.locator("details")).toHaveAttribute("open", "");
  expect(await dock.boundingBox()).toEqual(before);
  expect(await page.locator(".canvas").boundingBox()).toEqual(canvasBefore);
  const list = dock.locator("ol");
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const main = await page.locator("main").boundingBox();
  expect(main!.y + main!.height - before!.y - before!.height).toBeLessThanOrEqual(12);
  await page.screenshot({ path: test.info().outputPath("stable-event-log.png") });
});

test("workspace keeps scenarios, controls, API and live events within reach", async ({ page }) => {
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const session = await page.locator("iframe").getAttribute("src");
  const field = page.getByRole("spinbutton", { name: "Height (px)", exact: true });
  await field.fill("35");
  await expect(page.locator(".control").filter({ has: field })).toContainText(
    "Direct property assignment does not clamp",
  );
  await expect(field).toHaveValue("35");
  const frame = page.frames().find((item) => item.url().includes("preview.html"))!;
  await frame.evaluate(() =>
    parent.postMessage(
      {
        channel: "knx-gallery",
        sessionId: new URL(location.href).searchParams.get("session"),
        type: "event",
        event: { kind: "event", name: "value-changed", timestamp: Date.now(), args: { value: 35 } },
      },
      location.origin,
    ),
  );
  const dock = page.locator("knx-gallery-event-log");
  await expect(dock.locator(".latest-event")).toContainText("value-changed");
  await dock.getByText("Event log (1)", { exact: true }).click();
  await expect(dock.locator("li")).toHaveCount(1);
  await expect(field).toBeInViewport();
  await expect(dock.getByRole("button", { name: "Clear log" })).toBeInViewport();
  expect((await page.locator(".canvas").boundingBox())!.y).toBeLessThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await expect(page.locator("iframe")).toHaveAttribute("src", session!);
  await page.screenshot({
    path: test.info().outputPath("workspace-events.png"),
    animations: "disabled",
  });
  await page.goto("./?component=knx-dashboard&scenario=default");
  await expect(page.locator(".inspector .api-reference")).toContainText("hass");
  await expect(page.locator(".inspector .api-reference")).toBeVisible();
});

test("unified inspector keeps API context through invalid drafts and scenario resets", async ({
  page,
}) => {
  await page.goto("./?component=knx-separator&scenario=expanded");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const editor = page.locator("knx-gallery-controls");
  const field = editor.getByRole("spinbutton", { name: "Height (px)", exact: true });
  const property = editor
    .locator(".control")
    .filter({ has: page.getByRole("spinbutton", { name: "Height (px)", exact: true }) });
  await expect(property.locator(".control-description")).toContainText(
    "Direct property assignment does not clamp",
  );
  await expect(property.locator(".scenario-value")).toBeHidden();
  await field.fill("35");
  await expect(property.locator(".scenario-value")).toHaveText("Scenario value: 50");
  await field.fill("-1");
  await expect(property.getByRole("alert")).toBeVisible();
  await property.getByText("API details", { exact: true }).click();
  await expect(property.locator(".api-details")).toContainText("Defaults to 1");
  await expect(property.locator(".control-description")).toBeVisible();
  await expect(field).toHaveValue("-1");
  await expect(page.frameLocator("iframe").locator("knx-separator")).toHaveAttribute(
    "height",
    "35",
  );
  await property.getByRole("button", { name: "Reset Height (px)", exact: true }).click();
  await expect(field).toHaveValue("50");
  await expect(property.getByRole("alert")).toHaveCount(0);
  await expect(page.frameLocator("iframe").locator("knx-separator")).toHaveAttribute(
    "height",
    "50",
  );
  const slot = editor.locator(".slot-control");
  await expect(slot).toContainText("Content outside the current height is clipped");
  await expect(
    editor.getByText(
      "Default slot for content inside the separator. Content outside the current height is clipped.",
      { exact: true },
    ),
  ).toHaveCount(1);
  await expect(editor.getByRole("heading", { name: "Methods 4", exact: true })).toBeVisible();
  await expect(editor.locator(".api-reference")).toContainText("setHeight(newHeight, animate?)");
  await expect(editor.locator(".api-reference").getByText("height", { exact: true })).toHaveCount(
    0,
  );
});

test("inspector keeps callback switches documented separately from supplied callbacks", async ({
  page,
}) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const editor = page.locator("knx-gallery-controls");
  const control = editor.getByRole("group", { name: "Custom localize", exact: true });
  await expect(control.locator(".control-description")).toHaveText(
    "Enable an observed custom callback for the page title.",
  );
  await expect(
    editor.locator(".api-reference").getByText("customLocalize", { exact: true }),
  ).toHaveCount(0);
  const callbacks = editor
    .locator(".api-reference section")
    .filter({ has: page.getByRole("heading", { name: /^Callbacks/ }) });
  await expect(callbacks).toContainText("localizeFunc");
});

test("inspector search reveals matching details and filters interfaces without losing drafts", async ({
  page,
}) => {
  await page.goto("./?component=knx-separator&scenario=expanded");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const editor = page.locator("knx-gallery-controls");
  const search = editor.getByRole("searchbox", { name: "Search properties or functions" });
  const height = editor.getByRole("spinbutton", { name: "Height (px)", exact: true });
  await height.fill("-1");
  await search.fill("px optionally");
  await expect(editor.locator(".api-details p").filter({ visible: true })).toContainText(
    "Defaults to 1",
  );
  await expect(editor.locator("mark").filter({ visible: true })).not.toHaveCount(0);
  await search.fill("COLLAPSE");
  await editor.getByRole("button", { name: "Interfaces", exact: true }).click();
  await expect(
    editor.locator(".api-reference").getByText("collapse()", { exact: true }),
  ).toBeVisible();
  await expect(height).toBeHidden();
  await expect(
    editor.getByRole("button", { name: "Interfaces · Selected", exact: true }),
  ).toBeVisible();
  await search.fill("(");
  await expect(
    editor.locator(".api-reference").getByText("setHeight(newHeight, animate?)", { exact: true }),
  ).toBeVisible();
  await search.fill("nonexistent-property");
  await expect(
    editor.getByText("No matching properties or interfaces.", { exact: true }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(search).toHaveValue("");
  await editor.getByRole("button", { name: "Editable", exact: true }).click();
  await expect(height).toHaveValue("-1");
  await expect(editor.getByRole("alert")).toBeVisible();
  await editor.getByRole("button", { name: "Reset Height (px)", exact: true }).click();
  await expect(height).toHaveValue("50");
  await expect(editor.locator(".api-reference")).toBeHidden();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`compact inspector scrolls to the last interface and back at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    await page.getByRole("button", { name: "Open inspector", exact: true }).click();
    const inspector = page.locator(".inspector");
    const fields = inspector.locator(".inspector-fields");
    const box = (await inspector.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 40);
    await page.mouse.wheel(0, 10_000);
    await expect.poll(() => fields.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(fields.locator(".api-entry").last()).toBeInViewport();
    await expect(
      inspector.getByRole("searchbox", { name: "Search properties or functions", exact: true }),
    ).toBeInViewport();
    await page.mouse.wheel(0, -10_000);
    await expect.poll(() => fields.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(fields.locator(".component-context")).toBeInViewport();
  });
}

test("mobile inspector opens on demand and retains editor drafts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const field = page.getByRole("spinbutton", { name: "Height (px)", exact: true });
  await expect(field).toBeHidden();
  await page.getByRole("button", { name: "Open inspector", exact: true }).press("Enter");
  await expect(
    page.locator(".inspector").getByRole("button", { name: "Close inspector", exact: true }),
  ).toBeFocused();
  await field.fill("35");
  await page
    .locator(".inspector")
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await expect(field).toBeHidden();
  await expect(page.getByRole("button", { name: "Open inspector", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Open inspector", exact: true }).click();
  await expect(field).toHaveValue("35");
  await page.keyboard.press("Escape");
  await expect(field).toBeHidden();
  await expect(page.getByRole("button", { name: "Open inspector", exact: true })).toBeFocused();
  const frame = page.frames().find((item) => item.url().includes("preview.html"))!;
  await frame.evaluate(() =>
    parent.postMessage(
      {
        channel: "knx-gallery",
        sessionId: new URL(location.href).searchParams.get("session"),
        type: "event",
        event: {
          kind: "error",
          name: "A long local event name that must not hide the error count",
          timestamp: Date.now(),
          args: "Sample error",
        },
      },
      location.origin,
    ),
  );
  const dock = page.locator("knx-gallery-event-log");
  await expect(dock.locator(".console-heading .error")).toHaveText("Error · 1");
  expect(
    await dock
      .locator(".console-heading")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("workspace-mobile.png"),
    animations: "disabled",
  });
});

test("playground lifecycle keeps property updates local and replaces resets", async ({ page }) => {
  await page.goto("./?component=knx-separator&scenario=default");
  const preview = page.frameLocator("iframe");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(preview.locator("knx-separator")).toHaveAttribute("height", "1");
  expect(await page.evaluate(() => customElements.get("knx-separator"))).toBeUndefined();
  const session = await page.locator("iframe").getAttribute("src");
  await page.getByRole("spinbutton", { name: "Height (px)", exact: true }).fill("35");
  await expect(preview.locator("knx-separator")).toHaveAttribute("height", "35");
  await expect(page.locator("iframe")).toHaveAttribute("src", session!);
  await page.getByRole("button", { name: "Reset Height (px)", exact: true }).click();
  await expect(preview.locator("knx-separator")).toHaveAttribute("height", "1");
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.locator("iframe")).not.toHaveAttribute("src", session!);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const resetSession = await page.locator("iframe").getAttribute("src");
  await page.locator("#scenario-tabs").getByRole("tab", { name: "Expanded", exact: true }).click();
  await expect(page.locator("iframe")).not.toHaveAttribute("src", resetSession!);
  await expect(preview.locator("knx-separator")).toHaveAttribute("height", "50");
  await expect(page).toHaveURL(/component=knx-separator&scenario=expanded$/);
  await setChecked(page.getByRole("checkbox", { name: "Default content", exact: true }), true);
  await expect(preview.locator("knx-separator")).toContainText("Separator content");
  await page.screenshot({ path: test.info().outputPath("gallery-light.png"), fullPage: true });
  await page.goBack();
  await expect(preview.locator("knx-separator")).toHaveAttribute("height", "1");
});

test("viewport, theme and dialog history belong to the preview", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const frame = page.frameLocator("iframe").locator("html");
  const readViewport = () =>
    page
      .frameLocator("iframe")
      .locator("knx-separator")
      .evaluate((child) => {
        let narrow: boolean | undefined;
        child.dispatchEvent(
          Object.assign(new Event("context-request", { bubbles: true, composed: true }), {
            context: "narrowViewport",
            contextTarget: child,
            callback: (value: boolean) => {
              narrow = value;
            },
          }),
        );
        return { width: innerWidth, narrow, name: window.name };
      });
  expect(await readViewport()).toEqual({ width: 390, narrow: true, name: "ha-main-window" });
  const initialWidth = page.getByRole("spinbutton", { name: "Preview width (px)", exact: true });
  await initialWidth.fill("0");
  await initialWidth.press("Tab");
  await page.getByRole("button", { name: /^Phone · 390/ }).click();
  await expect(initialWidth).toHaveValue("390");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await expect.poll(readViewport).toEqual({ width: 1280, narrow: false, name: "ha-main-window" });
  const width = page.getByRole("spinbutton", { name: "Preview width (px)", exact: true });
  await width.fill("720");
  await width.press("Tab");
  await expect.poll(readViewport).toEqual({ width: 720, narrow: true, name: "ha-main-window" });
  await width.fill("0");
  await width.press("Tab");
  await expect(page.locator("#preview-width")).toHaveJSProperty("invalid", true);
  expect((await readViewport()).width).toBe(720);
  await page.getByRole("button", { name: /^Phone · 390/ }).click();
  await page
    .getByRole("group", { name: /^Preview mode:/ })
    .getByRole("button", { name: /^Dark/ })
    .click();
  await page.getByRole("button", { name: "Preview options", exact: true }).click();
  await page.locator("#gallery-theme ha-picker-field").click();
  await page.locator("#gallery-theme").getByRole("menuitem", { name: "KNX", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      frame.evaluate(() => {
        const host = document.querySelector("knx-gallery-preview") as HTMLElement & {
          hass: { themes: { darkMode: boolean; theme: string } };
        };
        return {
          dark: host.hass.themes.darkMode,
          theme: host.hass.themes.theme,
          color: getComputedStyle(host).getPropertyValue("--primary-color").trim(),
        };
      }),
    )
    .toEqual({ dark: true, theme: "knx", color: "#5e8a3a" });
  const url = page.url();
  await frame.evaluate(() => {
    class GalleryTestDialog extends HTMLElement {
      showDialog() {
        this.textContent = "Local test dialog";
      }
      closeDialog() {
        this.remove();
        return true;
      }
    }
    customElements.define("gallery-test-dialog", GalleryTestDialog);
    document.querySelector("knx-gallery-preview")!.dispatchEvent(
      new CustomEvent("show-dialog", {
        detail: {
          dialogTag: "gallery-test-dialog",
          dialogImport: () => Promise.resolve(),
          dialogParams: {},
        },
      }),
    );
  });
  await expect(page.frameLocator("iframe").locator("gallery-test-dialog")).toHaveText(
    "Local test dialog",
  );
  expect(await frame.evaluate(() => history.state?.dialog)).toBe("gallery-test-dialog");
  expect(await page.evaluate(() => history.state?.dialog)).toBeUndefined();
  expect(page.url()).toBe(url);
  await expect(page.locator("gallery-test-dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(page.frameLocator("iframe").locator("gallery-test-dialog")).toHaveCount(0);
  await expect(page.getByRole("group", { name: /^Preview mode:/ })).toHaveAttribute(
    "aria-label",
    "Preview mode: Dark",
  );
  await expect(width).toHaveValue("390");
  await page.getByRole("button", { name: "Close catalog", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeHidden();
  await page.getByRole("button", { name: "Open catalog", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("gallery-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("gallery-mobile.png"), fullPage: true });
});

test("late messages cannot change a reset session; the log is bounded and clearable", async ({
  page,
}) => {
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const previous = await page.locator("iframe").getAttribute("src");
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.locator("iframe")).not.toHaveAttribute("src", previous!);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const frame = page.frames().find((item) => item.url().includes("preview.html"))!;
  await frame.evaluate((old) => {
    const oldSession = new URL(old!, location.origin).searchParams.get("session");
    parent.postMessage(
      { channel: "knx-gallery", sessionId: oldSession, type: "error", error: "stale-error" },
      location.origin,
    );
    const sessionId = new URL(location.href).searchParams.get("session");
    for (let index = 0; index < 205; index++) {
      parent.postMessage(
        {
          channel: "knx-gallery",
          sessionId,
          type: "event",
          event: { kind: "event", name: `event-${index}`, timestamp: Date.now(), args: null },
        },
        location.origin,
      );
    }
  }, previous);
  await page.getByText("Event log (200)", { exact: true }).click();
  await expect(page.locator("knx-gallery-event-log li")).toHaveCount(200);
  await expect(page.getByText("event: event-204", { exact: true })).toBeVisible();
  await expect(page.getByText("event: event-0", { exact: true })).toHaveCount(0);
  await expect(page.getByText("stale-error", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const lastEntry = page.locator("knx-gallery-event-log li").first();
  const previousEntry = page.locator("knx-gallery-event-log li").nth(1);
  await expect(lastEntry.locator("summary")).toContainText("event: event-204");
  await expect(lastEntry.locator("summary time")).not.toBeEmpty();
  await expect(lastEntry.locator("pre")).toBeHidden();
  await lastEntry.locator("summary").focus();
  await lastEntry.locator("summary").press("Enter");
  await expect(lastEntry.locator("pre")).toBeVisible();
  await expect(lastEntry.locator("pre")).toHaveText("null");
  await expect(previousEntry.locator("pre")).toBeHidden();
  await lastEntry.locator("pre").scrollIntoViewIfNeeded();
  await page
    .locator("knx-gallery-event-log")
    .screenshot({ path: test.info().outputPath("event-disclosure.png") });
  await lastEntry.locator("summary").press("Space");
  await expect(lastEntry.locator("pre")).toBeHidden();
  await page.getByRole("button", { name: "Clear log" }).click();
  await expect(page.locator("knx-gallery-event-log li")).toHaveCount(0);
});

// This test deliberately emits browser errors, so it checks them explicitly.
base(
  "deferred ResizeObserver notifications keep the gallery usable; real errors remain visible",
  async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 595, height: 825 });
    await page.goto("./?component=knx-group-monitor&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const frame = page.frames().find((item) => item.url().includes("preview.html"))!;
    await Promise.all(
      [page.mainFrame(), frame].map(async (target) => {
        // A single resize during delivery creates a native notification, then settles.
        const diagnostics = await target.evaluate(
          () =>
            new Promise<string[]>((resolve) => {
              const messages: string[] = [];
              const onError = (event: ErrorEvent) => messages.push(event.message);
              window.addEventListener("error", onError);
              const element = document.createElement("div");
              element.style.cssText = "position:fixed;width:100px;height:1px";
              document.body.append(element);
              const observer = new ResizeObserver(() => {
                if (element.style.width === "100px") element.style.width = "101px";
                else {
                  observer.disconnect();
                  element.remove();
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                      window.removeEventListener("error", onError);
                      resolve(messages);
                    }),
                  );
                }
              });
              observer.observe(element);
            }),
        );
        expect(diagnostics).toEqual([
          "ResizeObserver loop completed with undelivered notifications.",
        ]);
        await expect(target.locator("#rspack-dev-server-client-overlay")).toHaveCount(0);
        await expect(page.getByRole("status")).toHaveText("Preview ready");
        await expect(frame.locator("knx-group-monitor")).toBeVisible();
      }),
    );
    expect(errors).toEqual([]);
    await frame.evaluate(() => {
      setTimeout(() => {
        throw new Error("Intentional runtime failure");
      });
    });
    await expect(page.getByRole("alert")).toHaveText("Intentional runtime failure");
    // Only the dev server has an error overlay; the production build reports through the gallery.
    if (process.env.GALLERY_E2E_PRODUCTION !== "1") {
      await expect(frame.locator("#rspack-dev-server-client-overlay")).toBeVisible();
    }
    expect(errors).toEqual(["Intentional runtime failure"]);
  },
);

test("a failing product update is visible and reset recovers", async ({ page }) => {
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const frame = page.frames().find((item) => item.url().includes("preview.html"))!;
  await frame.evaluate(() => {
    // Fault injection into the actual product component; no permanent fake examples.
    const component = document
      .querySelector("knx-gallery-preview")!
      .shadowRoot!.querySelector("knx-separator")!;
    Object.getPrototypeOf(component).render = () => {
      throw new Error("Intentional sample failure");
    };
  });
  await page.getByRole("spinbutton", { name: "Height (px)", exact: true }).fill("25");
  await expect(page.getByRole("alert")).toHaveText("Intentional sample failure");
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(page.frameLocator("iframe").locator("knx-separator")).toHaveAttribute("height", "1");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("catalog routing and controls remain keyboard accessible", async ({ page }) => {
  await page.goto("./?component=missing&scenario=default");
  await expect(page.getByRole("alert")).toContainText("does not exist");
  await page.getByRole("button", { name: "Back to catalog" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search title or tag" }).fill("knx-separator");
  const link = page.getByRole("link", { name: "Separator knx-separator" });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const height = page.getByRole("spinbutton", { name: "Height (px)", exact: true });
  await height.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.frameLocator("iframe").locator("knx-separator")).toHaveAttribute("height", "2");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Reset Height (px)", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(height).toHaveValue("1");
  await page.goto("./?component=knx-separator&scenario=missing");
  await expect(page.getByRole("alert")).toContainText("does not exist");
});

test("catalog categories combine with search without resetting the preview", async ({ page }) => {
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const nav = page.getByRole("navigation", { name: "Catalog" });
  const links = nav.locator(".catalog-list").getByRole("link");
  const search = nav.getByRole("searchbox", { name: "Search title or tag" });
  const session = await page.locator("iframe").getAttribute("src");
  await expect(links).toHaveCount(catalog.length);
  const layoutCount = catalogGroups.find(({ id }) => id === "layouts")!.entries.length;
  const layouts = nav.getByRole("button", { name: `Layouts ${layoutCount}`, exact: true });
  await layouts.click();
  await expect(links).toHaveCount(catalog.length - layoutCount);
  // The layout and its two internal parts share the tag prefix.
  await search.fill("knx-tabs-subpage-data");
  await expect(links).toHaveCount(3);
  await search.fill("");
  await expect(layouts).toHaveAttribute("aria-expanded", "false");

  const category = nav.getByRole("button", { name: /^Categories:/ });
  await category.focus();
  await page.keyboard.press("Enter");
  const dialogs = nav.getByRole("menuitem", { name: "Dialogs", exact: true });
  await dialogs.click();
  await expect(category).toHaveAccessibleName("Categories: Dialogs");
  await expect(links).toHaveCount(catalog.filter(({ meta }) => meta.category === "dialogs").length);
  await search.fill("DPT");
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute("href", /component=knx-dpt-select-dialog&/);
  await search.fill("knx-separator");
  await expect(nav.getByText("No matching components.")).toBeVisible();
  await category.click();
  await nav.getByRole("menuitem", { name: "All components", exact: true }).click();
  await expect(links).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveAttribute("src", session!);
  await search.fill("");
  await layouts.click();
  await expect(links).toHaveCount(catalog.length);
  await page.screenshot({ path: test.info().outputPath("catalog-desktop.png") });
  await page
    .getByRole("group", { name: /^Preview mode:/ })
    .getByRole("button", { name: /^Dark/ })
    .click();
  await page.screenshot({ path: test.info().outputPath("catalog-dark.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(search).toBeHidden();
  await page.locator(".heading .catalog-toggle").click();
  await expect(search).toBeVisible();
  await category.click();
  await dialogs.click();
  await expect(links).toHaveCount(catalog.filter(({ meta }) => meta.category === "dialogs").length);
  await page.screenshot({ path: test.info().outputPath("catalog-mobile.png") });
  await links.first().focus();
  await page.keyboard.press("Enter");
  await expect(search).toBeHidden();
  await expect(page.locator(".heading .catalog-toggle")).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Preview ready");
});

test("device presets and color buttons switch quickly without resetting the preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const session = await page.locator("iframe").getAttribute("src");
  for (const [name, width] of [
    ["Phone", 390],
    ["Large phone", 430],
    ["Tablet", 768],
    ["Landscape", 1024],
    ["Desktop", 1280],
  ] as const) {
    // Sequential device changes must all keep the same preview session.
    // eslint-disable-next-line no-await-in-loop
    await page.getByRole("button", { name: new RegExp(`^${name} · ${width}`) }).click();
    // eslint-disable-next-line no-await-in-loop
    await expect
      .poll(() =>
        page
          .frameLocator("iframe")
          .locator("html")
          .evaluate(() => innerWidth),
      )
      .toBe(width);
    // eslint-disable-next-line no-await-in-loop
    await expect(page.locator("iframe")).toHaveAttribute("src", session!);
  }
  await page
    .getByRole("group", { name: /^Preview mode:/ })
    .getByRole("button", { name: /^Dark/ })
    .click();
  await expect(page.getByRole("group", { name: /^Preview mode:/ })).toHaveAttribute(
    "aria-label",
    "Preview mode: Dark",
  );
  await page
    .getByRole("group", { name: /^Preview mode:/ })
    .getByRole("button", { name: /^Light/ })
    .click();
  await expect(page.getByRole("group", { name: /^Preview mode:/ })).toHaveAttribute(
    "aria-label",
    "Preview mode: Light",
  );
  await page.getByRole("spinbutton", { name: "Preview width (px)", exact: true }).fill("820");
  await page.getByRole("spinbutton", { name: "Preview width (px)", exact: true }).press("Tab");
  await expect(page.locator(".device-presets ha-button[appearance=accent]")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("editor-desktop.png"),
    animations: "disabled",
  });
  await page
    .getByRole("group", { name: /^Preview mode:/ })
    .getByRole("button", { name: /^Dark/ })
    .click();
  await page.screenshot({
    path: test.info().outputPath("editor-dark.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".device-menu").getByRole("button").click();
  await page.getByRole("menuitemcheckbox", { name: "Tablet · 768 px", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("editor-mobile.png"),
    animations: "disabled",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator(".device-presets ha-button").evaluateAll((buttons) =>
      buttons.every((button) => {
        const label = button.shadowRoot!.querySelector<HTMLElement>("[part=label]")!;
        return label.scrollWidth <= label.clientWidth;
      }),
    ),
  ).toBe(true);
});

test("canvas comparison shares controls, preserves sessions and keeps real viewport widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-separator&scenario=expanded");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const original = await page.locator("iframe").getAttribute("src");
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.locator("iframe")).toHaveCount(2);
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await expect(light.locator("knx-separator")).toHaveAttribute("height", "50");
  await expect(dark.locator("knx-separator")).toHaveAttribute("height", "50");
  await expect(light.locator("knx-gallery-preview")).toHaveCSS("color-scheme", "light");
  await expect(dark.locator("knx-gallery-preview")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("iframe").first()).toHaveAttribute("src", original!);
  await page.getByRole("spinbutton", { name: "Height (px)", exact: true }).fill("35");
  await expect(light.locator("knx-separator")).toHaveAttribute("height", "35");
  await expect(dark.locator("knx-separator")).toHaveAttribute("height", "35");
  const bounds = await light.locator("knx-separator").boundingBox();
  await page.getByRole("button", { name: "Component boundaries", exact: true }).click();
  await expect(light.locator(".gallery-component-boundaries > div")).toHaveCSS(
    "border-top-style",
    "dashed",
  );
  await expect(dark.locator(".gallery-component-boundaries > div")).toHaveCSS(
    "border-top-style",
    "dashed",
  );
  expect(await light.locator("knx-separator").boundingBox()).toEqual(bounds);
  await page.screenshot({
    path: test.info().outputPath("canvas-comparison.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: /^Tablet · 768/ }).click();
  expect(await light.locator("html").evaluate(() => innerWidth)).toBe(768);
  expect(await dark.locator("html").evaluate(() => innerWidth)).toBe(768);
  const cards = page.locator(".preview-card");
  await expect
    .poll(() =>
      cards.evaluateAll(
        ([lightCard, darkCard]) =>
          lightCard.getBoundingClientRect().y === darkCard.getBoundingClientRect().y,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".theme-mode-menu").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Light", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveAttribute("src", original!);
  await expect(light.locator("knx-separator")).toHaveAttribute("height", "35");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("./?component=knx-dashboard&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.getByRole("status").nth(1)).toHaveText("Preview ready");
  await page.screenshot({
    path: test.info().outputPath("canvas-dashboard.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("canvas-mobile.png"),
    animations: "disabled",
    fullPage: true,
  });
});

test("comparison reports an empty error only on the failing side", async ({ page }) => {
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.getByRole("status").nth(1)).toHaveText("Preview ready");
  await page
    .frameLocator('iframe[data-pane="comparison"]')
    .locator("html")
    .evaluate(() => {
      parent.postMessage(
        {
          channel: "knx-gallery",
          sessionId: new URL(location.href).searchParams.get("session"),
          type: "error",
          error: "",
        },
        location.origin,
      );
    });
  await expect(page.getByRole("status").first()).toHaveText("Preview ready");
  await expect(page.getByRole("status").nth(1)).toContainText("Preview failed");
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "error: Dark" }),
  ).toHaveCount(1);
});

test("comparison mirrors dialogs but records automation only in its originating preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-group-monitor-telegram-info-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await page.getByRole("button", { name: "Component boundaries", exact: true }).click();
  await dark.getByRole("button", { name: "Open dialog", exact: true }).click();
  await expect(dark.locator("ha-dialog wa-dialog dialog")).toHaveCSS("box-shadow", /inset/);
  await expect(light.getByRole("button", { name: "Create automation", exact: true })).toBeVisible();
  await dark.getByRole("button", { name: "Create automation", exact: true }).click();
  const log = page
    .locator("knx-gallery-event-log li")
    .filter({ hasText: "hass-automation-editor" });
  await expect(log).toHaveCount(1);
  await expect(log).toContainText("Dark · hass-automation-editor");
  await light.getByRole("button", { name: "Open dialog", exact: true }).click();
  await light.getByRole("button", { name: "Create automation", exact: true }).click();
  await expect(log).toHaveCount(2);
  await expect(log.filter({ hasText: "Light · hass-automation-editor" })).toHaveCount(1);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(light.locator("knx-group-monitor-telegram-info-dialog")).toHaveCount(0);
  await expect(dark.locator("knx-group-monitor-telegram-info-dialog")).toHaveCount(0);
  await expect(log).toHaveCount(0);
});

for (const width of [1600, 390]) {
  test(`heading menu toggles the catalog without resetting the preview at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./?component=knx-separator&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const session = await page.locator("iframe").getAttribute("src");
    const nav = page.getByRole("navigation", { name: "Catalog" });
    const toggle = page.locator(".heading .catalog-toggle");
    await expect(toggle).toBeVisible();
    expect((await toggle.boundingBox())!.x).toBeLessThan(
      (await page.locator(".heading h2").boundingBox())!.x,
    );
    await expect(page.getByRole("button", { name: "Maximize preview", exact: true })).toHaveCount(
      0,
    );
    if (width === 1600) {
      const before = (await page.locator(".canvas").boundingBox())!.width;
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(nav).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toBeFocused();
      await expect(page.locator(".inspector")).toBeVisible();
      expect((await page.locator(".canvas").boundingBox())!.width).toBeGreaterThan(before);
    } else {
      await expect(nav).toBeHidden();
    }
    await toggle.click();
    await expect(nav).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const search = nav.getByRole("searchbox", { name: "Search title or tag" });
    await search.fill("knx-tabs-subpage-data-toolbar");
    await toggle.click();
    await expect(nav).toBeHidden();
    await toggle.click();
    await expect(search).toHaveValue("knx-tabs-subpage-data-toolbar");
    await expect(page.locator("iframe")).toHaveAttribute("src", session!);
    await nav
      .getByRole("link", {
        name: "Tabs subpage data toolbar knx-tabs-subpage-data-toolbar",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/component=knx-tabs-subpage-data-toolbar/);
    if (width === 390) {
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
      await search.focus();
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
      await page.setViewportSize({ width: 1600, height: 844 });
      await expect(nav).toBeVisible();
      await toggle.click();
      await expect(nav).toBeHidden();
    } else {
      await expect(nav).toBeVisible();
    }
  });
}

test(
  "first mobile catalog selection returns focus to the current menu button",
  { tag: "@mobile" },
  async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    await page.getByRole("button", { name: "Open catalog", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Catalog" });
    await nav
      .getByRole("link", { name: "Tabs subpage data knx-tabs-subpage-data", exact: true })
      .click();
    await expect(page).toHaveURL(/component=knx-tabs-subpage-data/);
    await expect(nav).toBeHidden();
    await expect(page.getByRole("button", { name: "Open catalog", exact: true })).toBeFocused();
  },
);

test("HA editor controls preserve typed values and reset invalid drafts", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("navigation", { name: "Catalog" })).toBeVisible();
  await page.evaluate(async () => {
    await customElements.whenDefined("knx-gallery-controls");
    const editor = document.createElement("knx-gallery-controls");
    Object.assign(editor, {
      meta: {
        id: "typed",
        tag: "typed",
        title: "Typed",
        description: "",
        category: "components",
        api: [],
        slots: [{ name: "sample", label: "Sample slot" }],
        scenarios: [{ id: "default", label: "Default", values: {} }],
        controls: [
          {
            key: "title",
            label: "Title",
            kind: "text",
            target: "property",
            description: "Test text",
            defaultValue: "Original",
            validate: () => undefined,
          },
          {
            key: "count",
            label: "Count",
            kind: "number",
            target: "property",
            description: "Test number",
            defaultValue: 2,
            validate: () => undefined,
          },
          {
            key: "enabled",
            label: "Enabled",
            kind: "boolean",
            target: "property",
            description: "Test boolean",
            defaultValue: false,
            validate: () => undefined,
          },
          {
            key: "choice",
            label: "Choice",
            kind: "select",
            target: "property",
            description: "Test select",
            defaultValue: false,
            options: [
              { label: "Off", value: false },
              { label: "Five", value: 5 },
            ],
            validate: () => undefined,
          },
        ],
      },
    });
    editor.addEventListener("overrides-changed", (ev) =>
      Object.assign(editor, { overrides: ev.detail }),
    );
    editor.addEventListener("slots-changed", (ev) =>
      Object.assign(editor, { enabledSlots: ev.detail }),
    );
    document.body.append(editor);
  });
  const editor = page.locator("knx-gallery-controls");
  await expect(editor.locator(".control ha-input")).toHaveCount(2);
  await editor.getByRole("textbox", { name: "Title", exact: true }).fill("Changed");
  const count = editor.getByRole("spinbutton", { name: "Count", exact: true });
  await count.fill("3.5");
  await setChecked(editor.getByRole("switch", { name: "Enabled", exact: true }), true);
  await editor.locator("ha-select ha-picker-field").click();
  await page.getByRole("menuitem", { name: "Five", exact: true }).click();
  await setChecked(editor.getByRole("checkbox", { name: "Sample slot", exact: true }), true);
  const read = () =>
    editor.evaluate((element) => {
      const controls = element as HTMLElement & { overrides: unknown; enabledSlots: string[] };
      return { overrides: controls.overrides, slots: controls.enabledSlots };
    });
  expect(await read()).toEqual({
    overrides: { title: "Changed", count: 3.5, enabled: true, choice: 5 },
    slots: ["sample"],
  });
  await count.fill("");
  await expect(editor.getByRole("alert")).toBeVisible();
  expect((await read()).overrides).toEqual({
    title: "Changed",
    count: 3.5,
    enabled: true,
    choice: 5,
  });
  await editor.getByRole("button", { name: "Reset Count", exact: true }).click();
  await expect(count).toHaveValue("2");
  await editor.getByRole("button", { name: "Reset Choice", exact: true }).click();
  await expect(editor.locator("ha-select")).toContainText("Off");
  expect((await read()).overrides).toEqual({ title: "Changed", enabled: true });
});

test("inspector edits the real payload raw option, usage code and scenario reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-payload-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const editor = page.locator("knx-gallery-controls");
  const option = editor.getByRole("group", { name: "Raw", exact: true });
  const raw = option.getByRole("switch", { name: "Raw", exact: true });
  await expect(option.locator(".control-description")).toHaveText(
    "Start with a raw hexadecimal payload rather than a typed number.",
  );
  await expect(option.locator(".control-meta")).toContainText("Example option");
  const search = editor.getByRole("searchbox", { name: "Search properties or functions" });
  await search.fill("hexadecimal");
  await expect(option).toBeVisible();
  await search.fill("");
  await page.locator('[data-view="split"]').click();
  const code = page.locator(".code-panel code");
  const payload = page.frameLocator("iframe").locator("knx-payload-selector");
  await expect(payload).toHaveJSProperty("value", { value: 21.5 });
  await setChecked(raw, true);
  await expect(payload).toHaveJSProperty("value", { payload: "0x800", payload_length: 2 });
  await expect(payload.getByRole("radio", { name: "Raw payload", exact: true })).toBeChecked();
  await expect(payload.locator(".raw-payload input")).toHaveValue(/0?800/);
  await expect(code).toContainText('"payload": "0x0800"');
  await expect(code).not.toContainText(".raw=");
  await expect(code).toContainText('import { keyed } from "lit/directives/keyed.js"');
  await test
    .info()
    .attach("payload-raw-usage", { body: await code.innerText(), contentType: "text/plain" });
  await page.screenshot({
    path: test.info().outputPath("payload-visible-raw-usage.png"),
    animations: "disabled",
  });
  await editor.getByRole("button", { name: "Interfaces", exact: true }).click();
  await expect(option).toBeHidden();
  await expect(editor.locator(".api-reference").getByText("raw", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Editable", exact: true }).click();
  await option.getByRole("button", { name: "Reset Raw", exact: true }).click();
  await expect(raw).not.toBeChecked();
  await expect(payload).toHaveJSProperty("value", { value: 21.5 });
  await expect(code).toContainText('"value": 21.5');
  await expect(payload.getByRole("radio", { name: "Typed value", exact: true })).toBeChecked();
  const number = editor.getByRole("spinbutton", { name: "Number value", exact: true });
  await number.fill("42");
  await expect(payload.locator("ha-selector-number input")).toHaveValue("42");
  await expect(code).toContainText('"value": 42');
  await page.screenshot({
    path: test.info().outputPath("payload-visible-number-usage.png"),
    animations: "disabled",
  });
  await editor.getByRole("button", { name: "Reset Number value", exact: true }).click();
  await expect(payload.locator("ha-selector-number input")).toHaveValue("21.5");
  await number.fill("43");

  await setChecked(raw, true);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(raw).not.toBeChecked();
  await expect(payload).toHaveJSProperty("value", { value: 21.5 });
  await expect(payload.getByRole("radio", { name: "Typed value", exact: true })).toBeChecked();
  await expect(payload.locator("ha-selector-number input")).toHaveValue("21.5");
});

test("payload fixture edits converge in compare while unrelated controls preserve live input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-payload-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]').locator("knx-payload-selector");
  const dark = page.frameLocator('iframe[data-pane="comparison"]').locator("knx-payload-selector");
  const editor = page.locator("knx-gallery-controls");
  const raw = editor.getByRole("switch", { name: "Raw", exact: true });
  await setChecked(raw, true);
  await Promise.all(
    [light, dark].map(async (payload) => {
      await expect(payload.getByRole("radio", { name: "Raw payload", exact: true })).toBeChecked();
      await expect(payload.locator(".raw-payload input")).toHaveValue(/0?800/);
    }),
  );
  await setChecked(raw, false);
  await editor.getByRole("spinbutton", { name: "Number value", exact: true }).fill("42");
  await Promise.all(
    [light, dark].map(async (payload) => {
      await expect(payload.getByRole("radio", { name: "Typed value", exact: true })).toBeChecked();
      await expect(payload.locator("ha-selector-number input")).toHaveValue("42");
    }),
  );
  await page.screenshot({
    path: test.info().outputPath("payload-visible-compare-number.png"),
    animations: "disabled",
  });
  await light.locator("ha-selector-number input").fill("37");
  await light.locator("ha-selector-number input").press("Tab");
  await expect(dark.locator("ha-selector-number input")).toHaveValue("37");
  await light.evaluate((element) => element.setAttribute("data-instance", "preserved"));
  await setChecked(editor.getByRole("switch", { name: "Required", exact: true }), false);
  await expect(light).toHaveAttribute("data-instance", "preserved");
  await expect(light.locator("ha-selector-number input")).toHaveValue("37");
  await page
    .getByRole("group", { name: /^Preview mode:/ })
    .getByRole("button", { name: /^Dark/ })
    .click();
  await expect(light).toHaveAttribute("data-instance", "preserved");
  await page.getByRole("spinbutton", { name: "Preview width (px)", exact: true }).fill("600");
  await page.getByRole("spinbutton", { name: "Preview width (px)", exact: true }).press("Tab");
  await expect(light.locator("ha-selector-number input")).toHaveValue("37");
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(light.locator("ha-selector-number input")).toHaveValue("21.5");
});

test("payload external length updates reactively without remounting the raw editor", async ({
  page,
}) => {
  await page.goto("./?component=knx-payload-selector&scenario=no-dpt");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const payload = page.frameLocator("iframe").locator("knx-payload-selector");
  const editor = page.locator("knx-gallery-controls");
  await payload.evaluate((element) => element.setAttribute("data-instance", "preserved"));
  await editor.getByRole("spinbutton", { name: "Raw length", exact: true }).fill("3");
  await setChecked(editor.getByRole("switch", { name: "External length", exact: true }), true);
  await expect(payload.locator(".raw-payload input")).toHaveAttribute("maxlength", "6");
  await expect(payload.locator("ha-selector-number")).toHaveCount(0);
  await expect(payload).toHaveAttribute("data-instance", "preserved");
  await setChecked(editor.getByRole("switch", { name: "External length", exact: true }), false);
  await expect(payload.locator("ha-selector-number")).toBeVisible();
  await expect(payload).toHaveAttribute("data-instance", "preserved");
});

test("inspector rejects malformed form config and preserves subsequent address editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-form&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const editor = page.locator("knx-gallery-controls");
  const config = editor.getByRole("textbox", { name: "Config", exact: true });
  const form = page.frameLocator("iframe").locator("knx-form");
  const address = form.locator("knx-single-address-selector input").first();
  await expect(address).toHaveValue("1/0/1");
  await config.fill(JSON.stringify({ ga_switch: { write: "1/0/1", state: "1/0/1", passive: 42 } }));
  await expect(editor.getByRole("alert")).toBeVisible();
  await expect(address).toHaveValue("1/0/1");
  await address.fill("1/0/2");
  await address.press("Tab");
  await expect(address).toHaveValue("1/0/2");
  await page.screenshot({
    path: test.info().outputPath("form-rejected-config-live-address.png"),
    animations: "disabled",
  });
  await expect(form).toHaveJSProperty("config", { ga_switch: { write: "1/0/2", state: "1/0/1" } });
  await expect(page.getByRole("status")).toHaveText("Preview ready");
});

test("JSON controls retain valid values through errors in the real browser", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("navigation", { name: "Catalog" })).toBeVisible();
  await page.evaluate(async () => {
    await customElements.whenDefined("knx-gallery-controls");
    const control = document.createElement("knx-gallery-controls");
    Object.assign(control, {
      meta: {
        id: "isolated",
        tag: "isolated",
        title: "JSON",
        description: "",
        category: "components",
        api: [],
        slots: [],
        scenarios: [{ id: "default", label: "Default", values: {} }],
        controls: [
          {
            key: "data",
            label: "JSON data",
            kind: "json",
            target: "property",
            description: "Test JSON",
            defaultValue: { count: 1 },
            validate: (value: unknown) =>
              value &&
              typeof value === "object" &&
              "count" in value &&
              typeof value.count === "number" &&
              Object.keys(value).length === 1
                ? undefined
                : "Expected count",
          },
        ],
      },
      scenarioId: "default",
      overrides: {},
    });
    control.addEventListener("overrides-changed", (ev) =>
      Object.assign(control, { overrides: ev.detail }),
    );
    document.body.append(control);
  });
  const field = page.getByRole("textbox", { name: "JSON data", exact: true });
  await field.fill('{"count":2}');
  await field.fill("{");
  await expect(page.locator("ha-textarea")).toHaveJSProperty("invalid", true);
  await expect(page.getByRole("alert")).toContainText("valid JSON");
  for (const invalid of ["[]", '{"count":3,"other":1}', '{"__proto__":{}}']) {
    // Drafts are sequential; each must preserve the same last valid value.
    // eslint-disable-next-line no-await-in-loop
    await field.fill(invalid);
    // eslint-disable-next-line no-await-in-loop
    await expect(page.locator("ha-textarea")).toHaveJSProperty("invalid", true);
    expect(
      // eslint-disable-next-line no-await-in-loop
      await page
        .locator("knx-gallery-controls")
        .evaluate((control) => (control as HTMLElement & { overrides: unknown }).overrides),
    ).toEqual({ data: { count: 2 } });
  }
  await page.getByRole("button", { name: "Reset JSON data" }).click();
  await expect(field).toHaveValue('{\n  "count": 1\n}');
  await expect(page.locator("ha-textarea")).toHaveJSProperty("invalid", false);
});

// This single harness covers every actual descriptor/scenario, including future cohorts.

for (const { meta } of catalog.filter((entry) => entry.meta.category === "components")) {
  for (const scenario of meta.scenarios) {
    test(`components ${meta.tag} / ${scenario.id}`, async ({ page }) => {
      await page.goto(`./?component=${meta.id}&scenario=${scenario.id}`);
      await expect(page.getByRole("status")).toHaveText("Preview ready");
      const preview = page.frameLocator("iframe");
      await expect(preview.locator(meta.tag).first()).toBeAttached();
      for (const slot of meta.slots) {
        // Slot changes configure the same iframe; preserve their order.
        // eslint-disable-next-line no-await-in-loop
        await setChecked(page.getByRole("checkbox", { name: slot.label, exact: true }), true);
      }
      await expect(page.getByRole("status")).toHaveText("Preview ready");
      await expect(preview.locator(meta.tag).first()).toBeAttached();
      expect(
        await preview
          .locator("knx-gallery-preview")
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toContain("Roboto");
      await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
      await expect(page.getByRole("status")).toHaveText("Preview ready");
      await expect(preview.locator(meta.tag).first()).toBeAttached();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.locator("knx-gallery-event-log")).not.toContainText("error:");
      if (scenario.id === "invalid") {
        await expect(preview.locator(meta.tag).first()).toContainText(
          "Choose a valid group address.",
        );
      }
    });
  }
}

test("components public actions and controlled selections work", async ({ page }) => {
  await page.goto("./?component=knx-device-picker&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  await preview.getByRole("button", { name: "Open picker", exact: true }).click();
  await expect(preview.locator("ha-generic-picker input")).toBeVisible();
  await page.goto("./?component=knx-project-devices-view&scenario=unfiltered");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await preview.getByRole("button", { name: "Expand all", exact: true }).click();
  await expect(preview.locator("knx-sticky-expansion-panel").first()).toHaveAttribute(
    "expanded",
    "",
  );
  await preview.getByRole("button", { name: "Collapse all", exact: true }).click();
  await expect(preview.locator("knx-sticky-expansion-panel").first()).not.toHaveAttribute(
    "expanded",
    "",
  );
  await page.goto("./?component=knx-select-options-list&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const options = preview.locator("knx-select-options-list .option-header");
  await expect(options).toHaveCount(1);
  await preview.getByRole("button", { name: "Add option", exact: true }).click();
  await expect(options).toHaveCount(2);
  await preview.getByRole("button", { name: "Remove", exact: true }).last().click();
  await expect(options).toHaveCount(1);
  await expect(page.locator("knx-gallery-event-log")).toContainText("value-changed");
});

test("components template subscription produces a local result", async ({ page }) => {
  await page.goto("./?component=knx-expose-template-preview&scenario=template");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(page.frameLocator("iframe").locator("knx-expose-template-preview")).toContainText(
    "21.5",
  );
  await expect(page.locator("knx-gallery-event-log")).toContainText("render_template");
});

test("components slot examples start with useful content and can disable it", async ({ page }) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const content = page.frameLocator("iframe").locator("knx-tabs-subpage-data > div:not([slot])");
  await expect(content).toBeVisible();
  await setChecked(page.getByRole("checkbox", { name: "Default", exact: true }), false);
  await expect(content).toHaveCount(0);
});

test("components tabs subpage data clear action updates its public filter state", async ({
  page,
}) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=filters");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  await preview.getByRole("button", { name: "Clear filter", exact: true }).click();
  await expect
    .poll(() =>
      preview
        .locator("knx-tabs-subpage-data")
        .evaluate((element) => (element as HTMLElement & { filters: number }).filters),
    )
    .toBe(0);
});

test("components review tabs subpage data localizes its title and observes sample actions", async ({
  page,
}) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await setChecked(page.getByRole("switch", { name: "Custom localize", exact: true }), true);
  const preview = page.frameLocator("iframe");
  const log = page.locator("knx-gallery-event-log");
  await expect(preview.locator("hass-tabs-subpage")).toContainText("Localized page title");
  await expect(log).toContainText("localizeFunc");
  await expect(log).toContainText('"key": "sample.localizedPageTitle"');
  await expect(log).toContainText('"result": "Localized page title"');
  await preview.locator('[slot="toolbar-leading"]').click();
  await expect(log).toContainText('"slot": "toolbar-leading"');
  await preview.locator('[slot="toolbar-search"] input').fill("Kitchen light");
  await expect(log).toContainText('"slot": "toolbar-search"');
  await expect(log).toContainText('"value": "Kitchen light"');
});

test("components review time range selection and clear update the public range", async ({
  page,
}) => {
  await page.goto("./?component=knx-time-range-filter&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  const preview = page.frameLocator("iframe");
  const filter = preview.locator("knx-time-range-filter");
  await filter.locator(".picker-label").click();
  await preview.getByText("Last 5 minutes", { exact: true }).click();
  await expect
    .poll(() =>
      filter.evaluate((element) => {
        const range = element as HTMLElement & { startMs?: number; endMs?: number };
        return (
          range.startMs !== undefined &&
          range.startMs !== 1767268800000 &&
          range.endMs === undefined
        );
      }),
    )
    .toBe(true);
  await expect(filter.locator(".picker-label")).toContainText("now");
  await expect(page.locator("knx-gallery-event-log")).toContainText("time-range-changed");
  // Dismiss the date popover before using controls behind it in shorter viewports.
  await page.keyboard.press("Escape");
  await filter.locator('ha-icon-button[title="Clear filter"]').click();
  await expect
    .poll(() =>
      filter.evaluate((element) => {
        const range = element as HTMLElement & { startMs?: number; endMs?: number };
        return range.startMs === undefined && range.endMs === undefined;
      }),
    )
    .toBe(true);
  await expect(filter.locator(".picker-label")).toHaveText("Select a time range");
  await expect(filter.locator(".badge")).toHaveCount(0);
  await expect(page.locator("knx-gallery-event-log")).toContainText("time-range-cleared");
});

test("components review standalone sort item toggles twice", async ({ page }) => {
  await page.goto("./?component=knx-sort-menu-item&scenario=mobile");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  const item = preview.locator("knx-sort-menu-item");
  await setChecked(page.getByRole("switch", { name: "Active", exact: true }), false);
  await preview.getByText("Name", { exact: true }).click();
  await expect
    .poll(() => item.evaluate((element) => (element as HTMLElement & { active: boolean }).active))
    .toBe(true);
  await preview.getByRole("button", { name: "Ascending", exact: true }).click();
  await expect
    .poll(() =>
      item.evaluate((element) => (element as HTMLElement & { direction: string }).direction),
    )
    .toBe("desc");
  await preview.getByRole("button", { name: "Descending", exact: true }).click();
  await expect
    .poll(() =>
      item.evaluate((element) => (element as HTMLElement & { direction: string }).direction),
    )
    .toBe("asc");
  await expect
    .poll(() => item.evaluate((element) => (element as HTMLElement & { active: boolean }).active))
    .toBe(true);
  await expect(page.locator("knx-gallery-event-log")).toContainText('"direction": "desc"');
  await expect(page.locator("knx-gallery-event-log")).toContainText('"direction": "asc"');
});

for (const scenario of ["default", "collapsed"]) {
  test(`components review sticky heading is initially accessible / ${scenario}`, async ({
    page,
  }) => {
    await page.goto(`./?component=knx-sticky-expansion-panel&scenario=${scenario}`);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    await expect(
      page.frameLocator("iframe").getByRole("button", { name: "Living room light", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Header", exact: true })).toBeChecked();
  });
}

const dialogTags = catalog
  .filter(({ meta }) => meta.category === "dialogs")
  .map(({ meta }) => meta.tag);
for (const tag of dialogTags) {
  test(`dialogs ${tag} opens, closes and restores focus twice`, async ({ page }) => {
    await page.goto(`./?component=${tag}&scenario=default`);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const preview = page.frameLocator("iframe");
    const open = preview.getByRole("button", { name: "Open dialog", exact: true });
    const openAndClose = async (screenshot = false) => {
      await open.click();
      const dialog = preview.locator(tag);
      await expect(dialog.getByRole("dialog")).toBeVisible();
      if (screenshot) {
        await page
          .locator("iframe")
          .screenshot({ path: test.info().outputPath(`${tag}.png`), animations: "disabled" });
      }
      expect(await page.evaluate((name) => customElements.get(name), tag)).toBeUndefined();
      await dialog.getByRole("dialog").press("Escape");
      await expect(dialog.getByRole("dialog")).not.toBeVisible();
      await expect(open).toBeFocused();
    };
    await openAndClose(true);
    await openAndClose();
    await expect(
      page.locator("knx-gallery-event-log li").filter({ hasText: "dialog-opened" }),
    ).toHaveCount(2);
    await expect(
      page.locator("knx-gallery-event-log li").filter({ hasText: "dialog-closed" }),
    ).toHaveCount(2);
  });
}

test("dialogs send real address and payload exactly once", async ({ page }) => {
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  await openAnimatedDialog(preview);
  const dialog = preview.locator("knx-send-dialog");
  await expect(dialog.getByRole("button", { name: "Write", exact: true })).toBeDisabled();
  await dialog.locator("knx-single-address-selector input").fill("1/0/1");
  await dialog.locator("knx-single-address-selector input").press("Tab");
  await dialog.locator("knx-payload-selector input").last().fill("1");
  await dialog.locator("knx-payload-selector input").last().press("Tab");
  await dialog.getByRole("button", { name: "Write", exact: true }).click();
  const calls = page.locator("knx-gallery-event-log li").filter({ hasText: "knx.send" });
  await expect(calls).toHaveCount(1);
  await expect(calls).toContainText('"address": "1/0/1"');
  await expect(calls).toContainText('"payload": 1');
  await expect(calls).toContainText('"response": false');
  expect(
    await page
      .locator("knx-gallery-event-log")
      .evaluate((element) =>
        (element as HTMLElement & { events: { name: string; args: unknown }[] }).events
          .filter((event) => event.name === "knx.send")
          .map((event) => event.args),
      ),
  ).toEqual([{ address: "1/0/1", payload: 1, type: "1.001", response: false }]);
  await expect(dialog.getByRole("button", { name: "Write", exact: true })).toBeHidden();
  await openAnimatedDialog(preview);
  await dialog.locator("knx-single-address-selector input").fill("1/0/2");
  await dialog.getByRole("button", { name: "Read", exact: true }).click();
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "api: knx.read" }),
  ).toHaveCount(1);
});

for (const [tag, value] of [
  ["knx-dpt-select-dialog", "1.001"],
  ["knx-ga-select-dialog", "1/0/1"],
]) {
  test(`dialogs ${tag} confirms original value and cancels`, async ({ page }) => {
    await page.goto(`./?component=${tag}&scenario=default`);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const preview = page.frameLocator("iframe");
    const open = preview.getByRole("button", { name: "Open dialog", exact: true });
    await open.click();
    const dialog = preview.locator(tag);
    await expect(dialog.getByRole("button", { name: "OK", exact: true })).toBeDisabled();
    await dialog.locator(`ha-md-list-item[value="${value}"]`).click();
    // Observe the real callback return without replacing its implementation.
    await dialog.evaluate((element) => {
      const target = element as HTMLElement & {
        params: { onClose: (value?: string) => unknown };
        result?: unknown;
      };
      const original = target.params.onClose;
      target.params.onClose = (selected) => {
        target.result = original(selected);
        return target.result;
      };
    });
    const handle = await dialog.elementHandle();
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    expect(
      await handle!.evaluate((element) => (element as HTMLElement & { result?: unknown }).result),
    ).toBe(value);
    await expect(open).toBeFocused();
    await open.click();
    await preview.locator(tag).getByRole("button", { name: "Cancel", exact: true }).click();
    const calls = page.locator("knx-gallery-event-log li").filter({ hasText: "callback: onClose" });
    await expect(calls).toHaveCount(2);
    await expect(calls.nth(0)).toContainText("null");
    await expect(calls.nth(1)).toContainText(value);
  });
}

test("dialogs callback rejection remains rejected and observable", async ({ page }) => {
  await page.goto("./?component=knx-dpt-select-dialog&scenario=callback-reject");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  await preview.getByRole("button", { name: "Open dialog", exact: true }).click();
  const dialog = preview.locator("knx-dpt-select-dialog");
  await dialog.locator('ha-md-list-item[value="1.001"]').click();
  await dialog.evaluate((element) => {
    const target = element as HTMLElement & {
      params: { onClose: (value?: string) => Promise<unknown> };
      rejection?: string;
    };
    const original = target.params.onClose;
    target.params.onClose = (selected) => {
      const result = original(selected);
      void result.catch((error: Error) => {
        target.rejection = error.message;
      });
      return result;
    };
  });
  const handle = await dialog.elementHandle();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "error: onClose" }),
  ).toContainText("The local selection callback rejected.");
  expect(
    await handle!.evaluate(
      (element) => (element as HTMLElement & { rejection?: string }).rejection,
    ),
  ).toBe("The local selection callback rejected.");
});

test("dialogs non-bubbling selection Event keeps detail and normal send behavior", async ({
  page,
}) => {
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  await openAnimatedDialog(preview);
  const dialog = preview.locator("knx-send-dialog");
  await dialog.locator("knx-group-address-selector").evaluate((selector) =>
    selector.dispatchEvent(
      Object.assign(new Event("value-changed", { bubbles: false }), {
        detail: { value: { write: "1/0/2", dpt: "9.001" } },
      }),
    ),
  );
  await dialog.locator("knx-payload-selector").evaluate((selector) =>
    selector.dispatchEvent(
      Object.assign(new Event("value-changed", { bubbles: false }), {
        detail: { value: { value: 21.5 } },
      }),
    ),
  );
  await dialog.getByRole("button", { name: "Write", exact: true }).click();
  const log = page.locator("knx-gallery-event-log");
  await expect(log.locator("li").filter({ hasText: "knx.send" })).toHaveCount(1);
  const events = await log.evaluate(
    (element) => (element as HTMLElement & { events: { name: string; args: unknown }[] }).events,
  );
  expect(events.filter((event) => event.name === "value-changed")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ args: { value: { write: "1/0/2", dpt: "9.001" } } }),
      expect.objectContaining({ args: { value: { value: 21.5 } } }),
    ]),
  );
  expect(events.filter((event) => event.name === "knx.send")).toEqual([
    expect.objectContaining({
      args: { address: "1/0/2", payload: 21.5, type: "9.001", response: false },
    }),
  ]);
});

test("dialogs device validates empty name and returns created device", async ({ page }) => {
  await page.goto("./?component=knx-device-create-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  const open = preview.getByRole("button", { name: "Open dialog", exact: true });
  await open.click();
  const dialog = preview.locator("knx-device-create-dialog");
  await expect(dialog.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  await dialog.locator("ha-selector-text input").fill("Gallery device");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(open).toBeFocused();
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "callback: onClose" }),
  ).toContainText('"name": "Gallery device"');
  await open.click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "callback: onClose" }),
  ).toHaveCount(2);
});

for (const scenario of ["default", "format-error", "password-error"]) {
  test(`dialogs project upload ${scenario} processes locally`, async ({ page }) => {
    await page.goto(`./?component=knx-project-upload-dialog&scenario=${scenario}`);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const preview = page.frameLocator("iframe");
    const open = preview.getByRole("button", { name: "Open dialog", exact: true });
    await open.click();
    const dialog = preview.locator("knx-project-upload-dialog");
    await expect(dialog.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
    await expect(dialog.locator('input[type="file"]')).toHaveAttribute(
      "accept",
      ".knxproj, .knxprojarchive",
    );
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "synthetic.knxproj",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("Gallery synthetic fixture. Not an ETS project."),
    });
    await dialog.locator('input[type="password"]').fill("synthetic-password");
    await dialog.getByRole("button", { name: "Submit", exact: true }).click();
    if (scenario === "default") {
      await expect(open).toBeFocused();
      await expect(
        page.locator("knx-gallery-event-log li").filter({ hasText: "event: knx-reload" }),
      ).toHaveCount(1);
    } else {
      await expect(preview.getByText("Upload failed", { exact: true })).toBeVisible();
      await expect(
        preview.getByText(
          scenario === "format-error"
            ? "This scenario simulates an invalid ETS project format."
            : "This scenario simulates an incorrect project password.",
          { exact: true },
        ),
      ).toBeVisible();
      await preview.getByRole("button", { name: "OK", exact: true }).click();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(open).toBeFocused();
    }
    await expect(
      page.locator("knx-gallery-event-log li").filter({ hasText: "api: fetch /api/file_upload" }),
    ).toHaveCount(1);
    const process = page
      .locator("knx-gallery-event-log li")
      .filter({ hasText: "api: knx/project_file_process" });
    await expect(process).toHaveCount(1);
    await expect(process).toContainText('"file_id": "gallery-upload"');
    await expect(process).toContainText('"password": "synthetic-password"');
  });
}

for (const scenario of ["default", "validation-error"]) {
  test(`dialogs time server ${scenario} uses real save response`, async ({ page }) => {
    await page.goto(`./?component=knx-time-server-dialog&scenario=${scenario}`);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const preview = page.frameLocator("iframe");
    const open = preview.getByRole("button", { name: "Open dialog", exact: true });
    await open.click();
    const dialog = preview.locator("knx-time-server-dialog");
    const time = dialog.locator("knx-single-address-selector input").first();
    await expect(time).toHaveValue("1/0/3");
    await time.fill("1/0/6");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    if (scenario === "default") {
      await expect(open).toBeFocused();
      await open.click();
      await expect(dialog.locator("knx-single-address-selector input").first()).toHaveValue(
        "1/0/6",
      );
    } else {
      await expect(dialog.locator("ha-alert")).toHaveText(
        "Enter a valid group address before saving.",
      );
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(open).toBeFocused();
  });
}

test("dialogs telegram navigation uses deterministic rows", async ({ page }) => {
  await page.goto("./?component=knx-group-monitor-telegram-info-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  await preview.getByRole("button", { name: "Open dialog", exact: true }).click();
  const dialog = preview.locator("knx-group-monitor-telegram-info-dialog");
  await expect(dialog.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await expect(dialog.locator(".value-content")).toHaveText("true");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.locator(".value-content")).toHaveText("false");
  await expect(dialog.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(dialog.locator(".value-content")).toHaveText("true");
});

for (const tag of ["knx-dpt-select-dialog", "knx-ga-select-dialog"]) {
  test(`dialogs ${tag} empty options cannot confirm`, async ({ page }) => {
    await page.goto(`./?component=${tag}&scenario=empty`);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const preview = page.frameLocator("iframe");
    await preview.getByRole("button", { name: "Open dialog", exact: true }).click();
    const dialog = preview.locator(tag);
    await expect(dialog.getByRole("button", { name: "OK", exact: true })).toBeDisabled();
    await expect(dialog.locator("ha-md-list-item")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(preview.getByRole("button", { name: "Open dialog", exact: true })).toBeFocused();
  });
}

test("dialogs automation action records real config without parent navigation", async ({
  page,
}) => {
  await page.goto("./?component=knx-group-monitor-telegram-info-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const url = page.url();
  const preview = page.frameLocator("iframe");
  await preview.getByRole("button", { name: "Open dialog", exact: true }).click();
  await preview
    .locator("knx-group-monitor-telegram-info-dialog")
    .getByRole("button", { name: "Create automation", exact: true })
    .click();
  const log = page
    .locator("knx-gallery-event-log li")
    .filter({ hasText: "hass-automation-editor" });
  await expect(log).toHaveCount(1);
  await expect(log).toContainText('"alias": "KNX: 1/0/1 Living room light"');
  await expect(log).toContainText('"trigger": "knx.telegram"');
  await expect(log).toContainText('"expanded": true');
  expect(page.url()).toBe(url);
});

test("dialogs host bridge rejects events from replaced iframe realms", async ({ page }) => {
  await page.goto("./?component=knx-group-monitor-telegram-info-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const frame = page.frames().find((item) => item.url().includes("preview.html"))!;
  await frame.evaluate(() => {
    Object.assign(window.parent, {
      oldAutomationEvent: Object.assign(new Event("hass-automation-editor"), {
        detail: { data: { alias: "Stale automation" }, expanded: true },
      }),
      oldPanel: (window.parent as Window & { customPanel?: HTMLElement }).customPanel,
    });
  });
  const src = await page.locator("iframe").getAttribute("src");
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.locator("iframe")).not.toHaveAttribute("src", src!);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.evaluate(() => {
    const target = window as Window & {
      customPanel?: HTMLElement;
      oldPanel?: HTMLElement;
      oldAutomationEvent?: Event;
    };
    if (!target.customPanel || !target.oldPanel) throw new Error("Missing offline host bridge");
    target.customPanel.dispatchEvent(target.oldAutomationEvent!);
    target.oldPanel.dispatchEvent(target.oldAutomationEvent!);
    delete target.oldPanel;
    delete target.oldAutomationEvent;
  });
  const preview = page.frameLocator("iframe");
  await preview.getByRole("button", { name: "Open dialog", exact: true }).click();
  await preview
    .locator("knx-group-monitor-telegram-info-dialog")
    .getByRole("button", { name: "Create automation", exact: true })
    .click();
  const log = page
    .locator("knx-gallery-event-log li")
    .filter({ hasText: "hass-automation-editor" });
  await expect(log).toHaveCount(1);
  await expect(log).not.toContainText("Stale automation");
});

test("dialogs host bridge restores only the descriptor it owns", async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) {
      Object.defineProperty(window, "customPanel", { configurable: true, value: "previous owner" });
    }
  });
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  expect(
    await page.evaluate(() => {
      document.querySelector("knx-component-gallery")!.remove();
      return (window as Window & { customPanel?: unknown }).customPanel;
    }),
  ).toBe("previous owner");
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  expect(
    await page.evaluate(() => {
      Object.defineProperty(window, "customPanel", { configurable: true, value: "next owner" });
      document.querySelector("knx-component-gallery")!.remove();
      return (window as Window & { customPanel?: unknown }).customPanel;
    }),
  ).toBe("next owner");
});

/* eslint-disable no-await-in-loop -- View controls and navigation are intentionally sequential within one iframe. */
const viewText: Record<string, string> = {
  "knx-group-monitor": "Group monitor",
  "knx-dashboard": "KNX",
  "knx-dpt-reference": "DPT",
  "knx-create-entity": "Living room light",
  "knx-entities-view": "Living room light",
  "knx-error": "This is an offline KNX error example.",
  "knx-create-expose": "sensor.room_temperature",
  "knx-expose-view": "Room temperature",
  "knx-info": "Gallery house",
  "knx-project-view": "Living room light",
  "knx-frontend": "KNX",
};
for (const { meta } of catalog.filter((entry) => entry.meta.category === "views")) {
  for (const scenario of meta.scenarios) {
    test(`views ${meta.tag} / ${scenario.id}`, async ({ page }) => {
      await page.goto(`./?component=${meta.id}&scenario=${scenario.id}`);
      await expect(page.getByRole("status")).toHaveText("Preview ready");
      const preview = page.frameLocator("iframe");
      const view = preview.locator(meta.tag);
      const routed: Record<string, [string, string]> = {
        "route-not-found": ["knx-not-found", "/knx/gallery-missing-page"],
        "route-entities": ["knx-entities-router", "Living room light"],
        "route-expose": ["knx-expose-router", "Room temperature"],
        "route-project": ["knx-router", "Living room light"],
        "route-monitor": ["knx-router", "Group monitor"],
        "route-entity-create": ["knx-entities-router", "Create"],
        "route-expose-create": ["knx-expose-router", "sensor.room_temperature"],
      };
      if (routed[scenario.id]) {
        await expect(view.locator(routed[scenario.id][0])).toContainText(routed[scenario.id][1]);
      }
      if (scenario.id === "empty" && !meta.tag.startsWith("knx-create")) {
        if (meta.tag !== "knx-dpt-reference") {
          await expect(
            preview.getByRole("cell", {
              name: meta.tag === "knx-group-monitor" ? "Waiting for telegrams" : "No data",
              exact: true,
            }),
          ).toBeVisible();
        }
        await expect(view).not.toContainText("Living room light");
      }
      if (scenario.id === "no-project") await expect(view).not.toContainText("Gallery house");
      if (scenario.id === "validation-error" || scenario.id === "create") {
        await expect(
          view.getByRole("button", {
            name: scenario.id === "create" ? "Create" : "Save",
            exact: true,
          }),
        ).toBeVisible();
      }

      if (scenario.id === "default") await expect(view).toContainText(viewText[meta.tag]);
      if (scenario.id === "fetch-error") {
        await expect(
          preview.locator("ha-alert, hass-error-screen, knx-error").first(),
        ).toBeVisible();
      }
      if (scenario.id !== "fetch-error") {
        await expect(page.locator("knx-gallery-event-log")).not.toContainText("error:");
      }
      await expect(preview.locator("hass-loading-screen")).toHaveCount(0);
      if (scenario.id !== "fetch-error" && meta.tag !== "knx-error") {
        const alerts = preview.locator("ha-alert");
        for (const alert of await alerts.all()) {
          expect(
            await alert.evaluate((el) => (el as HTMLElement & { alertType: string }).alertType),
          ).not.toBe("error");
        }
      }
      if (scenario.id === "paused") {
        await expect(preview.locator("ha-alert").first()).toContainText("paused");
      }
      await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
      await expect(page.getByRole("status")).toHaveText("Preview ready");
      await expect(preview.locator("hass-loading-screen")).toHaveCount(0);
      if (scenario.id === "default") {
        await expect(view).toContainText(viewText[meta.tag]);
        await page
          .locator("iframe")
          .screenshot({ path: test.info().outputPath(`${meta.tag}.png`), animations: "disabled" });
      }
    });
  }
}

test("views monitor streams, pauses and resumes real rows", async ({ page }) => {
  await page.goto("./?component=knx-group-monitor&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  const preview = page.frameLocator("iframe");
  const rows = preview.getByRole("row");
  await expect.poll(() => rows.count()).toBeGreaterThan(2);
  await preview.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(preview.locator("ha-alert")).toContainText("paused");
  const count = await rows.count();
  await page.waitForTimeout(2700); // Two local telegram ticks must not change the paused table.
  await expect(rows).toHaveCount(count);
  await preview.getByRole("button", { name: "Resume", exact: true }).first().click();
  await expect.poll(() => rows.count()).toBeGreaterThan(count);
  await expect(preview.getByRole("cell").filter({ hasText: "1/0/2" }).first()).toBeVisible();
});

for (const tag of ["knx-create-entity", "knx-create-expose"]) {
  for (const scenario of ["default", "validation-error"]) {
    test(`views editor saves ${tag} / ${scenario}`, async ({ page }) => {
      await page.goto(`./?component=${tag}&scenario=${scenario}`);
      await expect(page.getByRole("status")).toHaveText("Preview ready");
      const outerUrl = page.url();
      const preview = page.frameLocator("iframe");
      await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
      if (tag === "knx-create-entity") {
        await preview
          .getByRole("textbox", { name: "Entity name", exact: true })
          .fill("Gallery edited light");
      } else await preview.getByPlaceholder("Add your notes here...").fill("Gallery edited notes");
      await preview.getByRole("button", { name: "Save", exact: true }).click();
      const api = tag === "knx-create-entity" ? "knx/update_entity" : "knx/update_expose";
      const call = page.locator("knx-gallery-event-log li").filter({ hasText: `api: ${api}` });
      await expect(call).toHaveCount(1);
      await expect(call).toContainText(
        tag === "knx-create-entity" ? "Gallery edited light" : "Gallery edited notes",
      );
      if (scenario === "validation-error") {
        await expect(preview.locator("ha-alert")).toContainText(
          "Choose a valid group address before saving.",
        );
      } else {
        await expect(
          preview.getByRole("cell", {
            name: tag === "knx-create-entity" ? "Gallery edited light" : "Room temperature",
            exact: true,
          }),
        ).toBeVisible();
      }
      expect(page.url()).toBe(outerUrl);
      await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Preview ready");
      if (tag === "knx-create-entity") {
        await expect(
          preview.getByRole("textbox", { name: "Entity name", exact: true }),
        ).toHaveValue("Living room light");
      } else {
        await expect
          .poll(() =>
            preview
              .locator("knx-create-expose")
              .evaluate((element) => Reflect.get(element, "_config").notes),
          )
          .toBe("Room temperature");
        await expect(preview.getByPlaceholder("Add your notes here...")).toHaveValue(
          "Room temperature",
        );
      }
      expect(page.url()).toBe(outerUrl);
    });
  }
}

test("views default editor resolves the KNX device identifier to its selection", async ({
  page,
}) => {
  await page.goto("./?component=knx-create-entity&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const picker = page.frameLocator("iframe").locator("knx-device-picker");
  await expect(picker).toHaveJSProperty("value", "1.1.1");
  await expect(picker.locator("ha-generic-picker")).toHaveJSProperty("value", "gallery-actuator");
  await expect(picker).toContainText("Living room actuator");
});

for (const platform of ["light", "sensor"]) {
  test(`views ${platform} creation validates its own field and returns its entity`, async ({
    page,
  }) => {
    await page.goto("./?component=knx-create-entity&scenario=empty");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
    const preview = page.frameLocator("iframe");
    await preview.locator(`a[href="/knx/entities/create/${platform}"]`).click();
    await preview
      .getByRole("textbox", { name: "Entity name*", exact: true })
      .fill(`New gallery ${platform}`);
    await preview.getByRole("button", { name: "Create", exact: true }).click();
    await expect(preview.locator('ha-alert[alert-type="error"]')).toContainText(
      platform === "light" ? "knx / ga_switch / write" : "knx / ga_sensor / state",
    );
    await expect(preview.locator("knx-single-address-selector").first()).toHaveJSProperty(
      "invalidMessage",
      "Choose a valid group address before saving.",
    );
    const address = platform === "light" ? "1/0/1" : "1/0/2";
    await preview.locator("knx-single-address-selector input").first().fill(address);
    await preview.locator("knx-single-address-selector input").first().press("Tab");
    await expect(preview.locator('ha-alert[alert-type="error"]')).toHaveCount(0);
    await preview.getByRole("button", { name: "Create", exact: true }).click();
    const calls = page
      .locator("knx-gallery-event-log li")
      .filter({ hasText: "api: knx/create_entity" });
    await expect(calls).toHaveCount(2);
    await expect(calls.first()).toContainText(`"platform": "${platform}"`);
    await expect(calls.first()).toContainText(
      `"${platform === "light" ? "write" : "state"}": "${address}"`,
    );
    if (platform === "sensor") await expect(calls.first()).toContainText('"dpt": "9.001"');
    const moreInfo = page
      .locator("knx-gallery-event-log li")
      .filter({ hasText: "event: hass-more-info" });
    await expect(moreInfo).toHaveCount(1);
    await expect(moreInfo).toContainText(`"entityId": "${platform}.new_gallery_${platform}"`);
    await expect(moreInfo).toContainText('"view": "settings"');
    await expect(preview.getByRole("button", { name: "Create", exact: true })).toHaveCount(0);
  });
}

test("views integration navigates real routers without changing catalog URL", async ({ page }) => {
  await page.goto("./?component=knx-frontend&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const outerUrl = page.url();
  const preview = page.frameLocator("iframe");
  await preview.locator('a[href="/knx/entities"]').click();
  await expect(
    preview
      .locator("knx-entities-router")
      .getByRole("cell", { name: "Living room light", exact: true }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "Add", exact: true }).click();
  await expect(preview.locator("knx-create-entity")).toContainText("Select");
  expect(page.url()).toBe(outerUrl);
});

test.describe("with a German browser locale", () => {
  test.use({ locale: "de-DE" });

  test("views integration keeps the English backend translations", async ({ page }) => {
    await page.goto("./?component=knx-frontend&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const preview = page.frameLocator("iframe");
    await expect(preview.locator("knx-dashboard")).toContainText("Connection settings");
    await expect(preview.locator("knx-dashboard")).toContainText("Group monitor");
  });
});

test("views project automation and device view use real actions", async ({ page }) => {
  await page.goto("./?component=knx-project-view&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const outerUrl = page.url();
  const preview = page.frameLocator("iframe");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await page.getByRole("button", { name: "Close catalog", exact: true }).click();
  await expect(preview.getByRole("cell", { name: "true", exact: true })).toBeVisible();
  const action = preview.getByRole("menuitem", { name: "Create automation", exact: true });
  // HA asynchronously re-sorts its first data batch and can replace the open row.
  // Retry opening that real row until its action can receive the click.
  await expect(async () => {
    if (!(await action.isVisible())) {
      await preview
        .getByRole("row")
        .filter({ hasText: "Living room light" })
        .getByRole("button", { name: "Overflow menu" })
        .click();
    }
    await action.click({ timeout: 1000 });
  }).toPass({ timeout: 5000 });
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "hass-automation-editor" }),
  ).toHaveCount(1);
  await expect(page.locator("knx-gallery-event-log")).toContainText('"trigger": "knx.telegram"');
  await preview.getByRole("button", { name: "Devices", exact: true }).click();
  await expect(preview.locator("knx-project-devices-view")).toContainText("Living room actuator");
  expect(page.url()).toBe(outerUrl);
});

test("views info removes the local project after confirmation", async ({ page }) => {
  await page.goto("./?component=knx-info&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const preview = page.frameLocator("iframe");
  await preview.getByRole("button", { name: "Delete project data", exact: true }).click();
  await preview.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator("knx-gallery-event-log")).toContainText("knx/project_file_remove");
  await expect(preview.locator("knx-info")).not.toContainText("Gallery house");
});

test("views entity creation and project drag context reach the real form", async ({ page }) => {
  await page.goto("./?component=knx-create-entity&scenario=create");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const url = page.url();
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  const preview = page.frameLocator("iframe");
  await preview.locator("knx-project-device-tree").getByRole("listitem").click();
  const draggable = preview.locator('knx-project-device-tree [draggable="true"]').first();
  await expect(draggable).toContainText("1/0/1");
  const data = await page.frames()[1].evaluateHandle(() => new DataTransfer());
  await draggable.dispatchEvent("dragstart", { dataTransfer: data });
  expect(await data.evaluate((transfer) => transfer.getData("text/group-address"))).toBe("1/0/1");
  await draggable.dispatchEvent("dragend", { dataTransfer: data });
  await preview.getByRole("textbox", { name: "Send address*", exact: true }).fill("1/0/1");
  await preview
    .getByRole("textbox", { name: "Entity name*", exact: true })
    .fill("New gallery light");
  await preview.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("knx-gallery-event-log")).toContainText("knx/create_entity");
  await expect(page.locator("knx-gallery-event-log")).toContainText("hass-more-info");
  await expect(page.locator("knx-gallery-event-log")).toContainText('"view": "settings"');
  expect(page.url()).toBe(url);
});

test("views replacement playground preserves tabs subpage data slots", async ({ page }) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  const preview = page.frameLocator("iframe");
  const view = preview.locator("knx-tabs-subpage-data");
  const metadata = catalog.find(({ meta }) => meta.tag === "knx-tabs-subpage-data")!.meta;
  for (const slot of metadata.slots) {
    await setChecked(page.getByRole("checkbox", { name: slot.label, exact: true }), true);
  }
  await setChecked(page.getByRole("switch", { name: "Show filters", exact: true }), true);
  await page.getByRole("button", { name: "Close catalog", exact: true }).click();
  const expectedSlots = metadata.slots.map((slot) => slot.name).sort();
  await expect
    .poll(() =>
      view.evaluate((element) =>
        Array.from(element.children)
          .map((child) => child.slot)
          .sort(),
      ),
    )
    .toEqual(expectedSlots);
  for (const name of expectedSlots) {
    // XPath keeps this check on the supplied light-DOM children, outside shadow roots.
    const sample = view.locator(name ? `xpath=./*[@slot="${name}"]` : "xpath=./*[not(@slot)]");
    await expect(sample).toHaveCount(1);
    await expect(sample).toBeVisible();
    await expect
      .poll(() =>
        sample.evaluate((element) => {
          const slot = element.assignedSlot;
          return {
            assigned: slot?.assignedElements().includes(element) ?? false,
            name: slot?.name,
            content: Boolean(
              element.textContent?.trim() ||
              Reflect.get(element, "label") ||
              Reflect.get(element, "placeholder"),
            ),
          };
        }),
      )
      .toEqual({ assigned: true, name, content: true });
  }
  await preview.locator('ha-input-chip[slot="active-filters"]').locator("button.trailing").click();
  await expect.poll(() => view.evaluate((element) => Reflect.get(element, "filters"))).toBe(0);
  await expect(view.locator("ha-input-chip")).not.toBeVisible();
  await expect(page.locator("knx-gallery-event-log")).toContainText("remove");
});

test("views router aliases are searchable in the catalog", async ({ page }) => {
  await page.goto("./");
  for (const tag of ["knx-router", "knx-entities-router", "knx-expose-router"]) {
    await page.getByRole("searchbox", { name: "Search title or tag" }).fill(tag);
    await expect(
      page.getByRole("link", { name: "KNX integration knx-frontend", exact: true }),
    ).toBeVisible();
  }
});

test("components expansion icon samples leave room for a long heading at 390 pixels", async ({
  page,
}) => {
  await page.goto("./?component=flex-content-expansion-panel&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page
    .getByRole("textbox", { name: "Header", exact: true })
    .fill(
      "Living room and adjoining kitchen lighting, shutters, temperature and ventilation controls",
    );
  const heading = page.frameLocator("iframe").locator("flex-content-expansion-panel .header");
  await expect(heading).toBeVisible();
  expect((await heading.boundingBox())!.width).toBeGreaterThan(120);
});

test("compare mirrors tabs subpage data filters and local input in both directions", async ({
  page,
}) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  await light.locator("ha-input-search input").fill("before compare");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await expect(dark.locator("ha-input-search input")).toHaveValue("before compare");
  await light
    .locator("knx-tabs-subpage-data")
    .getByRole("button", { name: /Filters/ })
    .first()
    .click();
  await expect
    .poll(() =>
      dark.locator("knx-tabs-subpage-data").evaluate((el) => Reflect.get(el, "showFilters")),
    )
    .toBe(true);
  await dark.locator("ha-input-search input").fill("from dark");
  await expect(light.locator("ha-input-search input")).toHaveValue("from dark");
  await page.getByRole("button", { name: /^Light/ }).click();
  await expect(light.locator("ha-input-search input")).toHaveValue("from dark");
});

test("compare derives active filter chips from accepted filter state", async ({ page }) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=filters");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  const chip = (frame: typeof light) => frame.locator("ha-input-chip");
  const checkbox = (frame: typeof light) => frame.locator('input[type="checkbox"]');
  await chip(light).locator("button.trailing").click();
  for (const frame of [light, dark]) {
    await expect(chip(frame)).toBeHidden();
    await expect(chip(frame)).toHaveAttribute("slot", "inactive-filters");
    await expect(checkbox(frame)).not.toBeChecked();
  }
  if (!(await checkbox(dark).isVisible())) {
    await dark
      .getByRole("button", { name: /Filters/ })
      .first()
      .click();
  }
  await checkbox(dark).check();
  for (const frame of [light, dark]) {
    await expect(chip(frame)).toBeVisible();
    await expect(checkbox(frame)).toBeChecked();
  }
  await checkbox(light).uncheck();
  await expect(chip(dark)).toBeHidden();
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  for (const pane of ["primary", "comparison"]) {
    await expect(
      page
        .frameLocator(`iframe[data-device="tablet"][data-pane="${pane}"]`)
        .locator("ha-input-chip"),
    ).toBeHidden();
  }
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  for (const device of ["desktop", "tablet"]) {
    for (const pane of ["primary", "comparison"]) {
      const frame = page.frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`);
      await expect(chip(frame)).toBeVisible();
      await expect(checkbox(frame)).toBeChecked();
    }
  }
});

test("compare mirrors list search, selection and expansion without echo events", async ({
  page,
}) => {
  await page.goto("./?component=knx-list-filter&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await light.locator("ha-input-search input").fill("Kitchen");
  await expect(dark.locator("ha-input-search input")).toHaveValue("Kitchen");
  await dark.locator("ha-input-search input").fill("");
  await expect(light.locator("ha-input-search input")).toHaveValue("");
  await dark.locator('.option-item[data-value="1/0/1"]').click();
  await expect
    .poll(() =>
      light.locator("knx-list-filter").evaluate((el) => Reflect.get(el, "selectedOptions")),
    )
    .toEqual([]);
  const toggle = dark.locator("flex-content-expansion-panel").getByRole("button").first();
  await toggle.press("Enter");
  await expect
    .poll(() => light.locator("knx-list-filter").evaluate((el) => Reflect.get(el, "expanded")))
    .toBe(false);
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: "Light · expanded-changed" }),
  ).toHaveCount(0);
});

test("compare mirrors dialog opening, edits and closing", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await dark.getByRole("button", { name: "Open dialog", exact: true }).click();
  await expect(light.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await dark.locator("knx-single-address-selector input").first().fill("1/2/30");
  await expect(light.locator("knx-single-address-selector input").first()).toHaveValue("1/2/30");
  await light.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dark.locator("knx-send-dialog")).toHaveCount(0);
});

for (const width of [1800, 390]) {
  test(`code split retains preview state and fits the workspace at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("./?component=knx-single-address-selector&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const preview = page.frameLocator("iframe");
    await preview.locator("knx-single-address-selector input").fill("1/2/30");
    const session = await page.locator("iframe").getAttribute("src");
    const setView = async (mode: "preview" | "split" | "code") => {
      const menu = page.locator(".view-mode-menu");
      if (await menu.isVisible()) {
        await menu.getByRole("button").click();
        await page
          .getByRole("menuitem", {
            name: { preview: "Preview", split: "Split", code: "Code" }[mode],
            exact: true,
          })
          .click();
      } else {
        await page.locator(`[data-view="${mode}"]`).click();
      }
    };
    await setView("split");
    const code = page.locator(".code-panel code");
    await expect(code).toContainText("<knx-single-address-selector");
    await expect(code).toContainText(".value=${");
    await expect(preview.locator("knx-single-address-selector input")).toHaveValue("1/2/30");
    await page.getByRole("button", { name: "Copy code", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await code.textContent(),
    );
    await setView("code");
    await expect(page.locator(".canvas")).toBeHidden();
    await setView("preview");
    await expect(page.locator("iframe")).toHaveAttribute("src", session!);
    await expect(preview.locator("knx-single-address-selector input")).toHaveValue("1/2/30");
    await setView("split");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const canvas = (await page.locator(".canvas").boundingBox())!;
    const panel = (await page.locator(".code-panel").boundingBox())!;
    if (width === 1800) expect(panel.x).toBeGreaterThan(canvas.x);
    else expect(panel.y).toBeGreaterThan(canvas.y);
    await page.screenshot({
      path: test.info().outputPath(`code-split-${width}.png`),
      animations: "disabled",
    });
  });
}

test("compare mirrors nested selector dialogs with local callbacks", async ({ page }) => {
  await page.goto("./?component=knx-dpt-dialog-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await light.locator("knx-dpt-dialog-selector .menu-button").click();
  await expect(dark.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await dark.locator("knx-dpt-select-dialog ha-input-search input").fill("switch");
  await expect(light.locator("knx-dpt-select-dialog ha-input-search input")).toHaveValue("switch");
  await dark.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(light.locator("knx-dpt-select-dialog")).toHaveCount(0);
});

test("multi-device compare converges nested dialog selection with callback locality", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-dpt-select-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.locator("iframe")).toHaveCount(4);
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  await source.getByRole("button", { name: "Open dialog", exact: true }).click();
  await source.locator('ha-md-list-item[value="1.001"]').click();
  for (const device of ["phone", "desktop"]) {
    for (const pane of ["primary", "comparison"]) {
      const peer = page.frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`);
      await expect(peer.locator("knx-dpt-select-dialog")).toHaveJSProperty("_selected", "1.001");
    }
  }
  await source.getByRole("button", { name: "OK", exact: true }).click();
  const callbacks = page
    .locator("knx-gallery-event-log li")
    .filter({ hasText: /callback: .*onClose/ });
  await expect(callbacks).toHaveCount(1);
  await expect(callbacks).toContainText("Desktop · Dark");
  for (const device of ["phone", "desktop"]) {
    for (const pane of ["primary", "comparison"]) {
      await expect(
        page
          .frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`)
          .locator("knx-dpt-select-dialog"),
      ).toHaveCount(0);
    }
  }
});

test("multi-device compare mirrors router-mounted editor state and keeps save API local", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-frontend&scenario=route-entities");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  const row = source.getByRole("row").filter({ hasText: "Living room light" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const name = source.getByRole("textbox", { name: "Entity name", exact: true });
  await name.fill("Only originating save");
  for (const device of ["phone", "desktop"]) {
    for (const pane of ["primary", "comparison"]) {
      await expect(
        page
          .frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`)
          .getByRole("textbox", { name: "Entity name", exact: true }),
      ).toHaveValue("Only originating save");
    }
  }
  await source.getByRole("button", { name: "Save", exact: true }).click();
  const saves = page
    .locator("knx-gallery-event-log li")
    .filter({ hasText: /api: .*knx\/update_entity/ });
  await expect(saves).toHaveCount(1);
  await expect(saves).toContainText("Desktop · Dark");
  for (const device of ["phone", "desktop"]) {
    for (const pane of ["primary", "comparison"]) {
      await expect(
        page
          .frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`)
          .getByRole("row")
          .filter({ hasText: /Living room light|Only originating save/ }),
      ).toContainText("Only originating save");
    }
  }
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  const late = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
  await expect(
    late.getByRole("row").filter({ hasText: /Living room light|Only originating save/ }),
  ).toContainText("Only originating save");
  await page
    .frameLocator('iframe[data-device="desktop"][data-pane="primary"]')
    .getByRole("row")
    .filter({ hasText: /Living room light|Only originating save/ })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  for (const device of ["phone", "desktop", "tablet"]) {
    for (const pane of ["primary", "comparison"]) {
      await expect(
        page
          .frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`)
          .getByRole("textbox", { name: "Entity name", exact: true }),
      ).toHaveValue("Only originating save");
    }
  }
  await expect(saves).toHaveCount(1);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  for (const device of ["phone", "desktop", "tablet"]) {
    for (const pane of ["primary", "comparison"]) {
      await expect(
        page
          .frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`)
          .getByRole("row")
          .filter({ hasText: /Living room light|Only originating save/ }),
      ).toContainText("Living room light");
    }
  }
});

test("compare rejected entity save preserves drafts and reset defaults", async ({ page }) => {
  await page.goto("./?component=knx-create-entity&scenario=validation-error");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-pane="primary"]');
  const peer = page.frameLocator('iframe[data-pane="comparison"]');
  await source.getByRole("textbox", { name: "Entity name", exact: true }).fill("Rejected light");
  await source.getByRole("button", { name: "Save", exact: true }).click();
  for (const frame of [source, peer]) {
    await expect(frame.locator("ha-alert")).toContainText(
      "Choose a valid group address before saving.",
    );
    await expect(frame.getByRole("textbox", { name: "Entity name", exact: true })).toHaveValue(
      "Rejected light",
    );
  }
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: /api: .*knx\/update_entity/ }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  for (const frame of [source, peer]) {
    await expect(frame.getByRole("textbox", { name: "Entity name", exact: true })).toHaveValue(
      "Living room light",
    );
    await expect(frame.locator("ha-alert")).toHaveCount(0);
  }
});

test("multi-device compare reset discards a pending editor save", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-create-entity&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  await source.locator("knx-create-entity").evaluate((element) => {
    const hass = Reflect.get(element, "hass") as {
      callWS(message: Record<string, unknown>): Promise<unknown>;
    };
    const call = hass.callWS.bind(hass);
    hass.callWS = async (message) => {
      const result = await call(message);
      if (message.type === "knx/update_entity") {
        await new Promise<void>((resolve) => {
          Reflect.set(window.parent, "releaseGallerySave", resolve);
        });
      }
      return result;
    };
  });
  await source.getByRole("textbox", { name: "Entity name", exact: true }).fill("Pending save");
  await source.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof Reflect.get(window, "releaseGallerySave")))
    .toBe("function");
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await page.evaluate(() => Reflect.get(window, "releaseGallerySave")());
  for (const device of ["phone", "desktop"]) {
    for (const pane of ["primary", "comparison"]) {
      await expect(
        page
          .frameLocator(`iframe[data-device="${device}"][data-pane="${pane}"]`)
          .getByRole("textbox", { name: "Entity name", exact: true }),
      ).toHaveValue("Living room light");
    }
  }
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: /api: .*knx\/update_entity/ }),
  ).toHaveCount(0);
});

test("compare mirrors sort menus and direction", async ({ page }) => {
  await page.goto("./?component=knx-sort-menu&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await light.getByRole("button", { name: "Sort", exact: true }).click();
  await expect
    .poll(() => dark.locator("ha-dropdown").evaluate((el) => Reflect.get(el, "open")))
    .toBe(true);
  await dark.locator('knx-sort-menu-item[criterion="address"]').click();
  await expect
    .poll(() => light.locator("knx-sort-menu").evaluate((el) => Reflect.get(el, "sortCriterion")))
    .toBe("address");
});

test("compare mirrors telegram navigation while retaining local row objects", async ({ page }) => {
  await page.goto("./?component=knx-group-monitor-telegram-info-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await light.getByRole("button", { name: "Open dialog", exact: true }).click();
  await dark.getByRole("button", { name: "Next", exact: true }).click();
  await expect(light.locator(".value-content")).toHaveText("false");
  await light.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(dark.locator(".value-content")).toHaveText("true");
});

test("compare converges after simultaneous edits from both panes", async ({ page }) => {
  await page.goto("./?component=knx-list-filter&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]').locator("ha-input-search input");
  const dark = page.frameLocator('iframe[data-pane="comparison"]').locator("ha-input-search input");
  for (let index = 0; index < 5; index++) {
    await Promise.all([light.fill(`light${index}`), dark.fill(`dark${index}`)]);
    await expect
      .poll(async () => (await light.inputValue()) === (await dark.inputValue()))
      .toBe(true);
  }
});

test("compare mirrors table settings and theme preserves edited input", async ({ page }) => {
  await page.goto("./?component=knx-entities-view&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await light.locator("ha-assist-chip.select-mode-chip").click();
  await expect(dark.locator("dialog-data-table-settings").getByRole("dialog")).toBeVisible();
  await dark
    .locator("dialog-data-table-settings")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(light.locator("dialog-data-table-settings").getByRole("dialog")).toBeHidden();
  await page.goto("./?component=knx-single-address-selector&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const input = page.frameLocator("iframe").locator("knx-single-address-selector input");
  await input.fill("1/2/30");
  await page.getByRole("button", { name: "Preview options", exact: true }).click();
  await page.locator("#gallery-theme").click();
  await page.getByRole("menuitem", { name: "KNX", exact: true }).click();
  await expect(input).toHaveValue("1/2/30");
});

test("usage code follows properties and slots and highlights HTML", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.locator('[data-view="split"]').click();
  const code = page.locator(".code-panel code");
  await expect(code.locator(".syntax-tag").first()).toBeVisible();
  await setChecked(page.getByRole("switch", { name: "Show filters", exact: true }), true);
  await expect(code).toContainText(`.showFilters=\${true}`);
  await setChecked(page.getByRole("checkbox", { name: "Banner", exact: true }), false);
  await expect(code).not.toContainText('slot="banner"');
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect(page.locator(".preview-caption [role=status]").nth(1)).toHaveText("Preview ready");
  const panel = (await page.locator(".code-panel").boundingBox())!;
  const canvas = (await page.locator(".canvas").boundingBox())!;
  expect(panel.y).toBeGreaterThan(canvas.y);
  await page.screenshot({
    path: test.info().outputPath("highlighted-compare-split.png"),
    animations: "disabled",
  });
});

test("rapid typing remains intact in preview and compare", async ({ page }) => {
  await page.goto("./?component=knx-list-filter&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const light = page.frameLocator('iframe[data-pane="primary"]').locator("ha-input-search input");
  const text = "abcdefghijklmnopqrstuvwxyz0123456789";
  await light.pressSequentially(text, { delay: 3 });
  await expect(light).toHaveValue(text);
  await page.getByRole("button", { name: /^Compare/ }).click();
  const dark = page.frameLocator('iframe[data-pane="comparison"]').locator("ha-input-search input");
  await expect(dark).toHaveValue(text);
  await dark.fill("");
  await dark.pressSequentially(text, { delay: 3 });
  await expect(dark).toHaveValue(text);
  await expect(light).toHaveValue(text);
});

test("inspector toggle frees the canvas and preserves drafts and preview", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("./?component=knx-separator&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const toggle = page.locator("#inspector-toggle");
  const inspector = page.locator(".inspector");
  const field = inspector.getByRole("spinbutton", { name: "Height (px)", exact: true });
  const session = await page.locator("iframe").getAttribute("src");
  await field.fill("35");
  const before = (await page.locator(".canvas").boundingBox())!.width;
  await toggle.click();
  await expect(inspector).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect((await page.locator(".canvas").boundingBox())!.width).toBeGreaterThan(before + 350);
  await expect(page.locator("iframe")).toHaveAttribute("src", session!);
  await toggle.press("Enter");
  await expect(inspector).toBeVisible();
  await expect(field).toHaveValue("35");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.click();
  await expect(inspector).toBeVisible();
  await expect(field).toHaveValue("35");
  await toggle.click();
  await expect(inspector).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(inspector).toBeHidden();
  await toggle.click();
  await expect(field).toHaveValue("35");
});

for (const width of [390, 1280]) {
  test(`component boundary is painted above KNX Info content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: 2160, height: 1000 });
    await page.goto("./?component=knx-info&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    if (width === 1280) await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
    const frame = page.frameLocator("iframe");
    const component = frame.locator("knx-info");
    await expect.poll(() => frame.locator("html").evaluate(() => innerWidth)).toBe(width);
    const before = (await component.boundingBox())!;
    // A strip inside the component edge must actually change pixels, not merely
    // report a CSS outline hidden underneath its fixed-position descendants.
    const clip = { x: before.x + 8, y: before.y, width: 100, height: 2 };
    const hidden = await page.screenshot({ clip, animations: "disabled" });
    await page.getByRole("button", { name: /^Component boundaries/ }).click();
    await expect(frame.locator("knx-gallery-preview")).toHaveAttribute("show-bounds", "");
    const visible = await page.screenshot({ clip, animations: "disabled" });
    expect(visible.equals(hidden)).toBe(false);
    expect(await component.boundingBox()).toEqual(before);
    await page.screenshot({
      path: test.info().outputPath(`info-boundary-${width}.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: /^Component boundaries/ }).click();
    expect((await page.screenshot({ clip, animations: "disabled" })).equals(hidden)).toBe(true);
  });
}

test("overview groups every example and opens its detail with the keyboard", async ({ page }) => {
  await page.goto("./");
  const overview = page.locator(".overview");
  await expect(overview.locator(".overview-card")).toHaveCount(catalog.length);
  await expect(overview.locator(".overview-group")).toHaveCount(6);
  const card = overview.locator('.overview-card[href*="component=knx-info&"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('[data-state="ready"]')).toBeVisible();
  await card.focus();
  await card.press("Enter");
  await expect(page).toHaveURL(/component=knx-info/);
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await expect(page.locator(".heading h2")).toBeFocused();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(overview.locator(".overview-card")).toHaveCount(catalog.length);
  const thumbnail = overview.locator("knx-gallery-thumbnail").first();
  await expect(thumbnail.locator('[data-state="ready"]')).toBeVisible({ timeout: 15_000 });
  const image = thumbnail.locator("img");
  const before = await image.getAttribute("src");
  await page
    .locator(".catalog-footer")
    .getByRole("button", { name: /^Switch application/ })
    .click();
  await expect(image).not.toHaveAttribute("src", before!);
  await expect(thumbnail.locator('[data-state="ready"]')).toBeVisible();
  await expect(image).toHaveJSProperty("complete", true);
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(
    0,
  );
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("overview shows generated dialog images without mounting previews", async ({ page }) => {
  await page.goto("./");
  const dialog = page.locator('.overview-card[href*="component=knx-send-dialog&"]');
  await dialog.scrollIntoViewIfNeeded();
  await expect(dialog.locator('[data-state="ready"]')).toBeVisible();
  await expect(dialog.locator("img")).toHaveJSProperty("naturalWidth", 800);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("overview-dialogs.png") });
});

test(
  "overview search works on mobile without horizontal overflow",
  { tag: "@mobile" },
  async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    await page.getByRole("button", { name: "Open catalog", exact: true }).click();
    await page.getByRole("searchbox").fill("knx-info");
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.locator(".overview-card")).toHaveCount(1);
    await expect(page.locator('.overview-card [data-state="ready"]')).toBeVisible();
    expect(await page.locator(".overview").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath("overview-mobile.png") });
  },
);

// A missing asset or a broken theme URL must fail even for cards initially offscreen.
test("overview loads every generated thumbnail in both themes", async ({ page }) => {
  await page.goto("./");
  const cards = page.locator(".overview-card");
  for (let theme = 0; theme < 2; theme++) {
    for (let index = 0; index < catalog.length; index++) {
      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('[data-state="ready"]')).toBeVisible();
      expect(
        await card.locator("img").evaluate((element: HTMLImageElement) => element.naturalWidth),
      ).toBeGreaterThan(0);
    }
    if (!theme) {
      await page
        .locator(".catalog-footer")
        .getByRole("button", { name: /^Switch application/ })
        .click();
    }
  }
  await expect(page.locator("iframe")).toHaveCount(0);
});

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

test("overview navigation reveals the active catalog entry below its sticky heading", async ({
  page,
}) => {
  await page.goto("./");
  const nav = page.getByRole("navigation", { name: "Catalog" });
  await nav.getByRole("button", { name: "Dialogs 7", exact: true }).click();
  await nav.locator(".catalog-list").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page
    .getByRole("link", {
      name: "Open example: Time server dialog (knx-time-server-dialog)",
      exact: true,
    })
    .click();
  const active = nav.locator('a[aria-current="page"]');
  await expect(active).toHaveAccessibleName("Time server dialog knx-time-server-dialog");
  await expect(nav.getByRole("button", { name: "Dialogs 7", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect
    .poll(() =>
      active.evaluate((element) => {
        const item = element.getBoundingClientRect();
        const list = element.closest(".catalog-list")!.getBoundingClientRect();
        const heading = element
          .closest(".catalog-group")!
          .querySelector("h3")!
          .getBoundingClientRect();
        return item.top >= Math.max(list.top, heading.bottom) && item.bottom <= list.bottom;
      }),
    )
    .toBe(true);
  await expect(page.locator(".heading h2")).toBeFocused();
  await page.goBack();
  await expect(nav.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("relationship navigation reveals filtered entries and follows selection when reopening the menu", async ({
  page,
}) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  const nav = page.getByRole("navigation", { name: "Catalog" });
  const search = nav.getByRole("searchbox", { name: "Search title or tag" });
  await nav.getByRole("button", { name: "Data & filters 9", exact: true }).click();
  await nav.getByRole("button", { name: /^Categories:/ }).click();
  await nav.getByRole("menuitem", { name: "Layouts", exact: true }).click();
  await search.fill("knx-tabs-subpage-data");
  await page
    .getByRole("region", { name: "Relationships", exact: true })
    .getByRole("link", { name: "knx-list-filter", exact: true })
    .click();
  await expect(search).toHaveValue("");
  await expect(nav.getByRole("button", { name: /^Categories:/ })).toHaveAccessibleName(
    "Categories: All components",
  );
  await expect(nav.getByRole("button", { name: "Data & filters 9", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const active = nav.locator('a[aria-current="page"]');
  await expect(active).toHaveAccessibleName("List filter knx-list-filter");
  await expect(active).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open inspector", exact: true }).click();
  await page
    .getByRole("region", { name: "Relationships", exact: true })
    .getByRole("link", { name: "knx-tabs-subpage-data", exact: true })
    .click();
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Open catalog", exact: true }).click();
  await expect(active).toHaveAccessibleName("Tabs subpage data knx-tabs-subpage-data");
  await expect(active).toBeInViewport();
});

test("overview category jumps preserve thumbnail images and expose component relationships", async ({
  page,
}) => {
  await page.goto("./");
  const jumps = page.getByRole("navigation", { name: "Overview categories", exact: true });
  await expect(jumps.getByRole("button")).toHaveCount(6);
  const first = page.locator("knx-gallery-thumbnail").first();
  await expect(first.locator('[data-state="ready"]')).toBeVisible();
  const source = await first.locator("img").getAttribute("src");
  await jumps.getByRole("button", { name: "Views 11", exact: true }).click();
  await expect(first.locator("img")).toHaveAttribute("src", source!);
  await jumps.getByRole("button", { name: "Layouts 6", exact: true }).focus();
  await page.keyboard.press("Enter");
  const heading = page.locator("#overview-layouts");
  await expect(heading).toBeFocused();
  await expect
    .poll(async () => {
      const bar = (await jumps.boundingBox())!;
      const target = (await heading.boundingBox())!;
      return target.y >= bar.y + bar.height - 1;
    })
    .toBe(true);
  const toolbar = page.locator('.overview-card[href*="component=knx-tabs-subpage-data-toolbar&"]');
  await expect(toolbar.locator(".overview-relationship")).toHaveText("Used by Tabs subpage data");
  const listFilter = page.locator('.overview-card[href*="component=knx-list-filter&"]');
  await expect(listFilter.locator(".overview-relationship")).toHaveText(
    "Can be placed in Tabs subpage data",
  );
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".overview-card")).toHaveCount(catalog.length);
  await expect(first.locator(".preview")).toHaveCSS("height", "224px");
  await page.setViewportSize({ width: 390, height: 844 });
  await jumps.getByRole("button", { name: "Dialogs 7", exact: true }).click();
  await expect(page.locator("#overview-dialogs")).toBeFocused();
  expect(
    await page
      .locator(".overview")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});

test("overview loads static thumbnails without starting preview applications", async ({ page }) => {
  const previews: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/preview.html")) previews.push(request.url());
  });
  await page.goto("./");
  const first = page.locator("knx-gallery-thumbnail").first();
  await expect(first.locator("img")).toBeVisible();
  await expect(first.locator("img")).toHaveJSProperty("naturalWidth", 1280);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(previews).toEqual([]);
});

test("toolbar stays on one line across available widths without replacing the preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1100 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const toolbar = page.locator(".canvas-toolbar");
  const frame = page.locator('iframe[data-pane="primary"]');
  const session = await frame.getAttribute("src");
  await expect(toolbar.locator("#preview-width")).toBeVisible();
  await expect(toolbar.locator(".display-modes")).toBeVisible();
  await expect(toolbar.locator(".device-label").first()).toBeVisible();
  for (const width of [
    2560, 2090, 2089, 2040, 2039, 1920, 1600, 1440, 1280, 1250, 1249, 1152, 1101, 1024, 768, 700,
    390, 320,
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(
        () =>
          toolbar.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return rect.height <= 64 && element.scrollWidth <= element.clientWidth;
          }),
        { message: `single toolbar row at ${width}px` },
      )
      .toBe(true);
    await expect(frame).toHaveAttribute("src", session!);
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole("button", { name: "Close inspector", exact: true }).click();
  await page.getByRole("button", { name: "Close catalog", exact: true }).click();
  await expect(frame).toHaveAttribute("src", session!);
  await expect(toolbar.locator(".view-mode-menu")).toBeVisible();
});

test("compact toolbar options and dropdowns share their state with the full toolbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const toolbar = page.locator(".canvas-toolbar");
  const session = await page.locator('iframe[data-pane="primary"]').getAttribute("src");
  await expect(toolbar.locator("#preview-width")).toBeHidden();
  await toolbar.getByRole("button", { name: /^Auto height/ }).click();
  await toolbar.getByRole("button", { name: "Preview options", exact: true }).click();
  const options = page.locator(".preview-options");
  await expect(options.getByRole("button", { name: /^Auto height/ })).toHaveAccessibleName(
    "Auto height · Selected",
  );
  const widthInput = options.getByRole("spinbutton", { name: "Preview width (px)", exact: true });
  await widthInput.fill("820");
  await widthInput.press("Tab");
  await setChecked(
    options.getByRole("switch", { name: "Component boundaries", exact: true }),
    true,
  );
  await page.keyboard.press("Escape");
  await toolbar.locator(".view-mode-menu").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Split", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lit usage", exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.locator('iframe[data-pane="comparison"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await toolbar.locator(".device-menu").getByRole("button").click();
  await page.getByRole("menuitemcheckbox", { name: "Tablet · 768 px", exact: true }).click();
  await toolbar.locator(".theme-mode-menu").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Dark", exact: true }).click();
  await page.setViewportSize({ width: 2560, height: 1100 });
  await expect(
    toolbar.getByRole("spinbutton", { name: "Preview width (px)", exact: true }),
  ).toHaveValue("768");
  await expect(toolbar.getByRole("button", { name: /^Auto height/ })).toHaveAccessibleName(
    "Auto height · Selected",
  );
  await expect(
    toolbar.getByRole("button", { name: "Component boundaries · Selected", exact: true }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Split · Selected", exact: true }),
  ).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Dark · Selected", exact: true })).toBeVisible();
  await expect(page.locator('iframe[data-pane="primary"]')).toHaveAttribute("src", session!);
});

test.describe("touch toolbar", () => {
  test.use({ hasTouch: true });
  test("keeps four usable controls on one line at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
    const toolbar = page.locator(".canvas-toolbar");
    const buttons = toolbar.getByRole("button");
    await expect(buttons).toHaveCount(4);
    for (const button of await buttons.all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await toolbar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(64);
    for (const button of await page.locator(".canvas-navigation").getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.locator(".canvas-navigation").evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("canvas-touch-320.png"),
      animations: "disabled",
    });
  });
});

test("canvas captions report actual viewport dimensions through resize, auto height and reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-separator&scenario=expanded");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const checkDimensions = async () => {
    for (const card of await page.locator(".preview-card").all()) {
      await expect
        .poll(async () => {
          const frame = await card.locator("iframe").evaluate((element: HTMLIFrameElement) => ({
            width: element.contentWindow!.innerWidth,
            height: element.contentWindow!.innerHeight,
            scale: Math.round(
              (element.getBoundingClientRect().width / element.contentWindow!.innerWidth) * 100,
            ),
          }));
          return (
            (await card.locator(".preview-dimensions").textContent())?.trim() ===
              `${Math.round(frame.width)} × ${Math.round(frame.height)} px` &&
            (await card.locator(".preview-scale").textContent())?.trim() === `${frame.scale}%`
          );
        })
        .toBe(true);
    }
  };
  await checkDimensions();
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await checkDimensions();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await checkDimensions();
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  await checkDimensions();
  await page.getByRole("button", { name: /^Auto height/ }).click();
  await expect(page.locator(".preview-dimensions")).toHaveText("390 × 50 px");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.locator(".preview-card")).toHaveCount(2);
  await checkDimensions();
  const height = page.getByRole("spinbutton", { name: "Height (px)", exact: true });
  await height.fill("12");
  await height.press("Tab");
  await expect(page.locator(".preview-dimensions")).toHaveText(["390 × 12 px", "390 × 12 px"]);
  await page.getByRole("button", { name: /^Auto height/ }).click();
  await page.getByRole("button", { name: "Tablet · 768 px", exact: true }).click();
  await checkDimensions();
  await page.setViewportSize({ width: 1280, height: 720 });
  await checkDimensions();
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await checkDimensions();
  await page.screenshot({ path: test.info().outputPath("canvas-caption-light.png") });
  await page
    .locator(".catalog-footer")
    .getByRole("button", { name: /^Switch application/ })
    .click();
  await page.screenshot({ path: test.info().outputPath("canvas-caption-dark.png") });
  await page.setViewportSize({ width: 320, height: 740 });
  await checkDimensions();
  for (const caption of await page.locator(".preview-caption").all()) {
    expect(await caption.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
});

test("fit zoom preserves the desktop viewport and shares original size across comparisons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await page.getByRole("button", { name: "Desktop · 1280 px", exact: true }).click();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  const primary = page.locator('iframe[data-pane="primary"]');
  const session = await primary.getAttribute("src");
  await expectBoardFits(page);
  await expect
    .poll(() => primary.evaluate((frame: HTMLIFrameElement) => frame.contentWindow!.innerWidth))
    .toBe(1280);
  expect((await primary.boundingBox())!.width).toBeLessThan(1280);
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await expect.poll(async () => (await primary.boundingBox())!.width).toBe(1280);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".canvas-navigation")).toHaveCount(1);
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  await expectBoardFits(page);
  await expect
    .poll(async () => (await page.locator('iframe[data-pane="comparison"]').boundingBox())!.width)
    .toBeCloseTo((await primary.boundingBox())!.width, 1);
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await light
    .locator("knx-tabs-subpage-data")
    .getByRole("button", { name: /Filters/ })
    .first()
    .click();
  await expect
    .poll(() =>
      dark.locator("knx-tabs-subpage-data").evaluate((el) => Reflect.get(el, "showFilters")),
    )
    .toBe(true);
  await expect(primary).toHaveAttribute("src", session!);
});

test("alignment inspection pins arbitrary elements, blocks actions and clears on exit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: "Desktop · 1280 px", exact: true }).click();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  const inspect = page
    .locator(".canvas-toolbar")
    .getByRole("button", { name: /^Inspect alignment/ });
  await inspect.click();
  await expect(inspect).toHaveAccessibleName("Inspect alignment · Selected");
  await inspect.click();
  await expect(
    page.frameLocator('iframe[data-pane="primary"]').locator("[data-gallery-guides]"),
  ).toHaveCount(0);
  await inspect.click();
  const bar = page.getByRole("region", { name: "Alignment inspection", exact: true });
  await expect(bar).toBeVisible();
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const lines = light.locator("[data-gallery-guides]");
  const filter = light
    .locator("knx-tabs-subpage-data")
    .getByRole("button", { name: /Filters/ })
    .first();
  await filter.hover();
  await expect(lines.locator('[data-kind="hover"] line')).toHaveCount(4);
  await filter.click();
  await expect(lines.locator('[data-kind="fixed"]')).toHaveCount(1);
  await expect
    .poll(() =>
      light.locator("knx-tabs-subpage-data").evaluate((el) => Reflect.get(el, "showFilters")),
    )
    .toBe(false);
  await filter.click();
  await expect(lines.locator('[data-kind="fixed"]')).toHaveCount(0);
  await light.locator("ha-input-search input").hover();
  await bar.getByRole("button", { name: "Choose element", exact: true }).click();
  await page.getByRole("menuitem", { name: "<knx-tabs-subpage-data>", exact: true }).click();
  await expect(lines.locator('[data-kind="fixed"]')).toHaveCount(1);
  await expect(lines.locator('[data-kind="fixed"]')).toHaveAttribute(
    "data-element",
    "knx-tabs-subpage-data",
  );
  await bar.getByRole("button", { name: "Reset guides", exact: true }).click();
  await expect(lines.locator('[data-kind="fixed"]')).toHaveCount(0);
  await expect(bar).toBeVisible();
  await filter.click();
  await bar.getByRole("button", { name: "Exit inspection", exact: true }).click();
  await expect(lines).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await expect(inspect).toHaveAccessibleName("Inspect alignment");
  await filter.click();
  await expect
    .poll(() =>
      light.locator("knx-tabs-subpage-data").evaluate((el) => Reflect.get(el, "showFilters")),
    )
    .toBe(true);
});

test("alignment mode is shared across compare and exits from either document", async ({ page }) => {
  await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("status").nth(1)).toHaveText("Preview ready");
  await page.getByRole("button", { name: "Preview options", exact: true }).click();
  await page.getByRole("button", { name: "Inspect alignment", exact: true }).click();
  await expect(
    page.locator(".preview-options").getByRole("button", { name: /^Inspect alignment/ }),
  ).toBeHidden();
  const bar = page.getByRole("region", { name: "Alignment inspection", exact: true });
  const light = page.frameLocator('iframe[data-pane="primary"]');
  const dark = page.frameLocator('iframe[data-pane="comparison"]');
  await light.locator("ha-input-search input").click();
  await dark.locator("ha-input-search input").click();
  await expect(bar.getByText("2 pinned", { exact: true })).toBeVisible();
  await expect(light.locator('[data-kind="fixed"]')).toHaveCount(1);
  await expect(dark.locator('[data-kind="fixed"]')).toHaveCount(1);
  await bar.getByRole("button", { name: "Reset guides", exact: true }).click();
  await expect(light.locator('[data-kind="fixed"]')).toHaveCount(0);
  await expect(dark.locator('[data-kind="fixed"]')).toHaveCount(0);
  await dark.locator("ha-input-search input").press("Escape");
  await expect(bar).toHaveCount(0);
  await expect(light.locator("[data-gallery-guides]")).toHaveCount(0);
  await expect(dark.locator("[data-gallery-guides]")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Preview options", exact: true }).click();
  await page.getByRole("button", { name: "Inspect alignment", exact: true }).click();
  await expect(
    page.locator(".preview-options").getByRole("button", { name: /^Inspect alignment/ }),
  ).toBeHidden();
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const before = (await bar.boundingBox())!;
  await page.locator(".canvas").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect((await bar.boundingBox())!.y).toBe(before.y);
  await page.screenshot({ path: test.info().outputPath("alignment-mobile.png") });
  await bar.getByRole("button", { name: "Reset guides", exact: true }).press("Escape");
  await expect(bar).toHaveCount(0);
});

test("alignment guides work above an open dialog without activating its buttons", async ({
  page,
}) => {
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  const frame = page.frameLocator('iframe[data-pane="primary"]');
  await openAnimatedDialog(frame);
  await expect(frame.getByRole("dialog", { includeHidden: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview options", exact: true }).click();
  await page.getByRole("button", { name: "Inspect alignment", exact: true }).click();
  await expect(
    page.locator(".preview-options").getByRole("button", { name: /^Inspect alignment/ }),
  ).toBeHidden();
  // The floating inspection bar can cover the footer's center on a short phone canvas.
  await frame
    .getByRole("button", { name: "Cancel", exact: true })
    .click({ position: { x: 10, y: 5 } });
  await expect(frame.locator('[data-kind="fixed"]')).toHaveCount(1);
  await expect(frame.getByRole("dialog", { includeHidden: true })).toBeVisible();
  await expect(frame.locator("[data-gallery-guides]")).toHaveJSProperty("popover", "manual");
  await page.screenshot({ path: test.info().outputPath("alignment-dialog.png") });
  await frame.getByRole("button", { name: "Cancel", exact: true }).press("Escape");
  await expect(frame.locator("[data-gallery-guides]")).toHaveCount(0);
  await expect(frame.getByRole("dialog", { includeHidden: true })).toBeVisible();
  await frame.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(frame.getByRole("dialog", { includeHidden: true })).toBeHidden();
});

test("outcome migration persists time config when a peer reopens the dialog", async ({ page }) => {
  await page.goto("./?component=knx-time-server-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-pane="comparison"]');
  const peer = page.frameLocator('iframe[data-pane="primary"]');
  await source.getByRole("button", { name: "Open dialog", exact: true }).click();
  await source.locator("knx-single-address-selector input").first().fill("1/0/6");
  await source.getByRole("button", { name: "Save", exact: true }).click();
  await expect(peer.locator("knx-time-server-dialog")).toHaveCount(0);
  await peer.getByRole("button", { name: "Open dialog", exact: true }).click();
  await expect(peer.locator("knx-single-address-selector input").first()).toHaveValue("1/0/6");
  await expect(
    page
      .locator("knx-gallery-event-log li")
      .filter({ hasText: /api: .*knx\/update_time_server_config/ }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  const late = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
  await expect(late.locator("knx-single-address-selector input").first()).toHaveValue("1/0/6");
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(Array(4).fill("Preview ready"));
  await late.getByRole("button", { name: "Open dialog", exact: true }).click();
  await expect(late.locator("knx-single-address-selector input").first()).toHaveValue("1/0/3");
});

for (const component of ["knx-device-picker", "knx-configure-entity"]) {
  test(`outcome migration creates a named device through ${component}`, async ({ page }) => {
    await page.setViewportSize({ width: 2160, height: 1000 });
    await page.goto(`./?component=${component}&scenario=default`);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
    await page.getByRole("button", { name: /^Compare/ }).click();
    const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
    const peer = page.frameLocator('iframe[data-device="desktop"][data-pane="primary"]');
    await source.locator("knx-device-picker ha-generic-picker").click();
    await openAnimatedDialog(source, source.getByText("Add new device…", { exact: true }));
    await source
      .locator("knx-device-create-dialog ha-selector-text input")
      .fill("Upstairs actuator");
    await source.getByRole("button", { name: "Add", exact: true }).click();
    for (const frame of [source, peer]) {
      await expect(frame.locator("knx-device-picker")).toContainText("Upstairs actuator");
    }
    await peer.locator("knx-device-picker ha-generic-picker").click();
    await expect(peer.getByText("Upstairs actuator", { exact: true }).last()).toBeVisible();
    await peer.locator("knx-device-picker input").press("Escape");
    await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
    const late = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
    await expect(late.locator("knx-device-picker")).toContainText("Upstairs actuator");
    await expect(
      page.locator("knx-gallery-event-log li").filter({ hasText: /api: .*knx\/create_device/ }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
    await expect(late.locator("knx-device-picker")).not.toContainText("Upstairs actuator");
  });
}

test("outcome migration creates and deletes an entity across Compare readers", async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-entities-view&scenario=empty");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  const peer = page.frameLocator('iframe[data-device="desktop"][data-pane="primary"]');
  await source.getByRole("button", { name: "Add", exact: true }).click();
  await source.locator('a[href="/knx/entities/create/sensor"]').click();
  await source.getByRole("textbox", { name: "Entity name*", exact: true }).fill("Accepted sensor");
  await source.locator("knx-single-address-selector input").first().fill("1/0/2");
  await source.locator("knx-single-address-selector input").first().press("Tab");
  await source.getByRole("button", { name: "Create", exact: true }).click();
  for (const frame of [source, peer]) {
    await expect(frame.getByRole("row").filter({ hasText: "Accepted sensor" })).toBeVisible();
  }
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  const late = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
  await expect(late.getByRole("row").filter({ hasText: "Accepted sensor" })).toBeVisible();
  await peer
    .getByRole("row")
    .filter({ hasText: "Accepted sensor" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(peer.getByRole("textbox", { name: /^Entity name/ })).toHaveValue("Accepted sensor");
  await expect(peer.locator("knx-single-address-selector input").first()).toHaveValue("1/0/2");
  await peer.locator("knx-single-address-selector input").first().fill("1/0/3");
  await peer.locator("knx-single-address-selector input").first().press("Tab");
  await peer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(late.getByRole("row").filter({ hasText: "Accepted sensor" })).toContainText("1/0/3");
  await peer
    .getByRole("row")
    .filter({ hasText: "Accepted sensor" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await peer.getByRole("button", { name: "OK", exact: true }).click();
  for (const frame of [source, peer, late]) {
    await expect(frame.getByRole("row").filter({ hasText: "Accepted sensor" })).toHaveCount(0);
  }
  for (const action of ["create", "update", "delete"]) {
    await expect(
      page
        .locator("knx-gallery-event-log li")
        .filter({ hasText: new RegExp(`api: .*knx/${action}_entity`) }),
    ).toHaveCount(1);
  }
});

test("outcome migration restores expose notes and deletion in peer and late readers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-create-expose&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  const peer = page.frameLocator('iframe[data-device="desktop"][data-pane="primary"]');
  await source.getByPlaceholder("Add your notes here...").fill("Accepted expose notes");
  await source.getByRole("button", { name: "Save", exact: true }).click();
  await expect(peer.getByRole("row").filter({ hasText: "Room temperature" })).toBeVisible();
  await peer
    .getByRole("row")
    .filter({ hasText: "Room temperature" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(peer.getByPlaceholder("Add your notes here...")).toHaveValue(
    "Accepted expose notes",
  );
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  const late = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
  await expect(late.getByPlaceholder("Add your notes here...")).toHaveValue(
    "Accepted expose notes",
  );
  await peer.getByRole("button", { name: "Back", exact: true }).click();
  await peer
    .getByRole("row")
    .filter({ hasText: "Room temperature" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(peer.getByPlaceholder("Add your notes here...")).toHaveValue(
    "Accepted expose notes",
  );
  await peer.getByPlaceholder("Add your notes here...").fill("Updated expose notes");
  await peer.locator("knx-single-address-selector input").first().fill("1/0/3");
  await peer.locator("knx-single-address-selector input").first().press("Tab");
  await peer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(late.getByRole("row").filter({ hasText: "Room temperature" })).toContainText(
    "1/0/3",
  );
  await peer
    .getByRole("row")
    .filter({ hasText: "Room temperature" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await peer.getByRole("button", { name: "OK", exact: true }).click();
  for (const frame of [source, peer, late]) {
    await expect(frame.getByRole("row").filter({ hasText: "Room temperature" })).toHaveCount(0);
  }
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: /api: .*knx\/update_expose/ }),
  ).toHaveCount(2);
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: /api: .*knx\/delete_expose/ }),
  ).toHaveCount(1);
});

test("outcome migration removes and imports the project with one local native upload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-info&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  const peer = page.frameLocator('iframe[data-device="desktop"][data-pane="primary"]');
  await source.getByRole("button", { name: "Delete project data", exact: true }).click();
  await source.getByRole("button", { name: "OK", exact: true }).click();
  for (const frame of [source, peer]) {
    await expect(frame.locator("knx-info")).not.toContainText("Gallery house");
  }
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  const late = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
  await expect(late.locator("knx-info")).not.toContainText("Gallery house");
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: /api: .*knx\/project_file_remove/ }),
  ).toHaveCount(1);
  await source.getByRole("button", { name: "Back", exact: true }).click();
  await source.getByText("Import ETS project", { exact: true }).click();
  await source.locator('input[type="file"]').setInputFiles({
    name: "Gallery.knxproj",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("offline fixture"),
  });
  await expect(peer.locator('input[type="file"]')).toHaveValue("");
  await source.getByRole("button", { name: "Submit", exact: true }).click();
  for (const frame of [source, peer, late]) {
    await expect(frame.locator('a[href="/knx/project"]')).toBeVisible();
  }
  await expect(
    page
      .locator("knx-gallery-event-log li")
      .filter({ hasText: /api: .*knx\/project_file_process/ }),
  ).toHaveCount(1);
});

test("outcome migration publishes a delayed telegram after the send dialog closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  const peer = page.frameLocator('iframe[data-device="desktop"][data-pane="primary"]');
  await openAnimatedDialog(source);
  await source.locator("knx-single-address-selector input").fill("1/0/2");
  await source.getByRole("button", { name: "Read", exact: true }).click();
  await expect(source.locator("knx-send-dialog")).toHaveCount(0);
  const readHistory = (frame: FrameLocator) =>
    frame.locator("knx-gallery-preview").evaluate(async (element) => {
      const result = await Reflect.get(element, "hass").callWS({ type: "knx/group_monitor_info" });
      return result.recent_telegrams.filter(
        (telegram: { direction: string }) => telegram.direction === "Outgoing",
      );
    });
  await expect
    .poll(() => readHistory(peer))
    .toEqual([expect.objectContaining({ destination: "1/0/2", telegramtype: "GroupValueRead" })]);
  expect(await readHistory(peer)).toEqual(await readHistory(source));
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  const late = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
  await expect.poll(() => readHistory(late)).toEqual(await readHistory(source));
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: /api: .*knx\.read/ }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(Array(4).fill("Preview ready"));
  await expect.poll(() => readHistory(late)).toEqual([]);
});

test("outcome migration gives the monitor one producer across writer and device lifecycle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-group-monitor&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click({ modifiers: ["Meta"] });
  await page.getByRole("button", { name: /^Compare/ }).click();
  const desktop = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  const phone = page.frameLocator('iframe[data-device="phone"][data-pane="primary"]');
  const producerCount = () =>
    page.locator("iframe").evaluateAll(
      (frames) =>
        frames.filter((frame) => {
          const host = (frame as HTMLIFrameElement).contentDocument?.querySelector(
            "knx-gallery-preview",
          );
          return host && Reflect.get(host, "_sync")?.canProduce;
        }).length,
    );
  const rows = (frame: FrameLocator) =>
    frame
      .locator("knx-group-monitor")
      .evaluate((element) =>
        Reflect.get(element, "controller").telegrams.map((row: { id: string }) => row.id),
      );
  await expect.poll(producerCount).toBe(1);
  await expect.poll(() => rows(phone).then((items) => items.length)).toBeGreaterThan(1);
  await desktop.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await rows(desktop);
  await expect.poll(() => rows(phone)).toEqual(paused);
  await page.waitForTimeout(2600);
  expect(await rows(desktop)).toEqual(paused);
  expect(await rows(phone)).toEqual(paused);
  await expect.poll(producerCount).toBe(1);
  await desktop.getByRole("button", { name: "Resume", exact: true }).first().click();
  await expect
    .poll(() => rows(desktop).then((items) => items.length))
    .toBeGreaterThan(paused.length);
  await page.getByRole("button", { name: /^Compare/ }).click();
  await expect.poll(producerCount).toBe(1);
  const resumed = (await rows(phone)).length;
  await expect.poll(() => rows(phone).then((items) => items.length)).toBeGreaterThan(resumed);
  await phone
    .locator('ha-icon-overflow-menu[slot="toolbar-icon"]')
    .getByRole("button", { name: "Overflow menu", exact: true })
    .click();
  await phone.getByRole("menuitem", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: /^Phone · 390/ }).click({ modifiers: ["Meta"] });
  const retained = page.frameLocator('iframe[data-device="desktop"][data-pane="primary"]');
  await expect.poll(producerCount).toBe(1);
  await expect(retained.locator("ha-alert")).toContainText("paused");
  await retained.getByRole("button", { name: "Resume", exact: true }).first().click();
  const before = (await rows(retained)).length;
  await expect.poll(() => rows(retained).then((items) => items.length)).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Reset scenario", exact: true }).click();
  await expect.poll(producerCount).toBe(1);
  await expect(retained.locator("ha-alert")).toHaveCount(0);
});

test("outcome migration keeps a delayed user telegram after writer handoff without reverting its draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1000 });
  await page.goto("./?component=knx-send-dialog&scenario=default");
  await expect(page.getByRole("status")).toHaveText("Preview ready");
  await page.getByRole("button", { name: /^Desktop · 1280/ }).click();
  await page.getByRole("button", { name: /^Compare/ }).click();
  const source = page.frameLocator('iframe[data-device="desktop"][data-pane="comparison"]');
  const peer = page.frameLocator('iframe[data-device="desktop"][data-pane="primary"]');
  await openAnimatedDialog(source);
  await source.locator("knx-single-address-selector input").fill("1/0/2");
  // Hold only the real fixture's delivery timer, leaving dialog/navigation timing native.
  await source.locator("knx-gallery-preview").evaluate(() => {
    const original = window.setTimeout;
    Reflect.set(window, "galleryOriginalTimeout", original);
    window.setTimeout = ((handler, delay, ...args) => {
      if (delay === 30 && typeof handler === "function") {
        Reflect.set(window, "galleryPendingTelegram", () => handler(...args));
        return 987654;
      }
      return original(handler, delay, ...args);
    }) as typeof window.setTimeout;
  });
  await source.getByRole("button", { name: "Read", exact: true }).click();
  await source.locator("knx-gallery-preview").evaluate(() => {
    window.setTimeout = Reflect.get(window, "galleryOriginalTimeout");
  });
  await expect(peer.locator("knx-send-dialog")).toHaveCount(0);
  await peer.getByRole("button", { name: "Open dialog", exact: true }).click();
  await peer.locator("knx-single-address-selector input").fill("1/0/3");

  await expect
    .poll(() =>
      source
        .locator("knx-gallery-preview")
        .evaluate((element) => Reflect.get(element, "_sync").canProduce),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page
        .locator("knx-component-gallery")
        .evaluate((element) => JSON.stringify(Reflect.get(element, "_previewState"))),
    )
    .toContain("1/0/3");
  // Exercise immediate late configuration without relying on the new writer's next snapshot.
  await peer.locator("knx-gallery-preview").evaluate((element) => {
    Reflect.get(element, "_sync").schedule = () => undefined;
  });
  await source.locator("knx-gallery-preview").evaluate((element) => {
    const row = Reflect.get(element, "_environment").fixtures.data.telegrams[0];
    const message = {
      channel: "knx-gallery",
      sessionId: Reflect.get(element, "_sessionId"),
      type: "fixture-telegrams",
      revision: Reflect.get(element, "_sync").revision + 99,
      telegrams: [{ ...row, direction: "Outgoing", destination: "1/0/9" }],
    };
    window.parent.postMessage(message, location.origin);
    window.parent.postMessage(
      { ...message, revision: Reflect.get(element, "_sync").revision, sessionId: "old-session" },
      location.origin,
    );
    Reflect.get(window, "galleryPendingTelegram")();
  });
  const history = (frame: FrameLocator) =>
    frame
      .locator("knx-gallery-preview")
      .evaluate(async (element) =>
        (
          await Reflect.get(element, "hass").callWS({ type: "knx/group_monitor_info" })
        ).recent_telegrams.filter((row: { direction: string }) => row.direction === "Outgoing"),
      );
  await expect
    .poll(() => history(peer))
    .toEqual([expect.objectContaining({ destination: "1/0/2", telegramtype: "GroupValueRead" })]);
  await expect(peer.locator("knx-single-address-selector input")).toHaveValue("1/0/3");
  await page.getByRole("button", { name: /^Tablet · 768/ }).click({ modifiers: ["Meta"] });
  const late = page.frameLocator('iframe[data-device="tablet"][data-pane="primary"]');
  await expect(late.locator("knx-single-address-selector input")).toHaveValue("1/0/3");
  await expect.poll(() => history(late)).toEqual(await history(source));
  await expect(
    page.locator("knx-gallery-event-log li").filter({ hasText: /api: .*knx\.read/ }),
  ).toHaveCount(1);
});

// Mobile-only regressions use the same strict console/network fixture as desktop.
test.describe("Pixel 7 touch", { tag: ["@mobile", "@mobile-touch"] }, () => {
  test("emulates a mobile touch device rather than only a narrow viewport", async ({
    page,
    isMobile,
  }) => {
    expect(isMobile).toBe(true);
    await page.goto("./?component=knx-separator&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    expect(
      await page.evaluate(() => ({
        touchPoints: navigator.maxTouchPoints,
        coarsePointer: matchMedia("(pointer: coarse)").matches,
        mobileUserAgent: /Android.*Mobile/.test(navigator.userAgent),
        viewportWidth: innerWidth,
        screenWidth: screen.width,
        pixelRatio: devicePixelRatio,
      })),
    ).toEqual({
      touchPoints: 1,
      coarsePointer: true,
      mobileUserAgent: true,
      viewportWidth: 412,
      screenWidth: 412,
      pixelRatio: 2.625,
    });
    await page.getByRole("button", { name: "Open inspector", exact: true }).tap();
    await expect(page.locator(".inspector")).toBeVisible();
  });

  test("inspector opens and touch scroll reaches the last interface and returns to the top", async ({
    page,
  }) => {
    await page.goto("./?component=knx-tabs-subpage-data&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    await page.getByRole("button", { name: "Open inspector", exact: true }).tap();
    const inspector = page.locator(".inspector");
    const fields = inspector.locator(".inspector-fields");
    const box = (await fields.boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const repeatCount = Math.ceil(await fields.evaluate((el) => el.scrollHeight / 400));
    await fields.evaluate((element) => {
      element.addEventListener(
        "touchmove",
        (event) => {
          element.setAttribute("data-trusted-touch-move", String(event.isTrusted));
        },
        { once: true, passive: true },
      );
    });
    // Use the native touch stream behind Playwright tap; synthetic scroll gestures
    // return successfully without scrolling in the Linux headless container.
    const swipe = async (direction: 1 | -1) => {
      const y = direction === 1 ? box.y + box.height - 40 : box.y + 40;
      for (let repeat = 0; repeat <= repeatCount; repeat++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: box.x + box.width / 2, y }],
        });
        for (let step = 1; step <= 8; step++) {
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: box.x + box.width / 2, y: y - (direction * 400 * step) / 8 }],
          });
          await page.evaluate(
            () =>
              new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
              }),
          );
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
    };
    await swipe(1);
    await expect(fields).toHaveAttribute("data-trusted-touch-move", "true");
    await expect(fields.locator(".api-entry").last()).toBeInViewport();
    await expect(
      inspector.getByRole("searchbox", { name: "Search properties or functions", exact: true }),
    ).toBeInViewport();
    await swipe(-1);
    await expect.poll(() => fields.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(fields.locator(".component-context")).toBeInViewport();
    await inspector.getByRole("button", { name: "Close inspector", exact: true }).tap();
    await expect(inspector).toBeHidden();
    await expect(page.getByRole("button", { name: "Open inspector", exact: true })).toBeVisible();
    await session.detach();
  });

  test("catalog and scenario navigation respond to touch", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "Open catalog", exact: true }).tap();
    const nav = page.getByRole("navigation", { name: "Catalog", exact: true });
    await nav.getByRole("link", { name: "Separator knx-separator", exact: true }).tap();
    await expect(page).toHaveURL(/component=knx-separator&scenario=default$/);
    await expect(nav).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    await page.locator("#gallery-scenario ha-picker-field").tap();
    await page
      .locator("#gallery-scenario")
      .getByRole("menuitem", { name: "Expanded", exact: true })
      .tap();
    await expect(page).toHaveURL(/component=knx-separator&scenario=expanded$/);
    await expect(page.getByRole("status")).toHaveText("Preview ready");
  });

  test("compact toolbar device, theme and view actions respond to touch", async ({ page }) => {
    await page.goto("./?component=knx-single-address-selector&scenario=default");
    await expect(page.getByRole("status")).toHaveText("Preview ready");
    const toolbar = page.locator(".canvas-toolbar");
    const frame = page.locator('iframe[data-pane="primary"]');
    const session = await frame.getAttribute("src");
    await toolbar.locator(".device-menu").getByRole("button").tap();
    await page.getByRole("menuitemcheckbox", { name: "Tablet · 768 px", exact: true }).tap();
    await page.getByRole("menuitemcheckbox", { name: "Phone · 390 px", exact: true }).tap();
    await toolbar.locator(".device-menu").getByRole("button").tap();
    await expect
      .poll(() => frame.evaluate((el: HTMLIFrameElement) => el.contentWindow!.innerWidth))
      .toBe(768);
    await toolbar.locator(".theme-mode-menu").getByRole("button").tap();
    await page.getByRole("menuitem", { name: "Dark", exact: true }).tap();
    await expect(toolbar.locator(".theme-mode-menu").getByRole("button")).toHaveAccessibleName(
      /Dark/,
    );
    await toolbar.locator(".view-mode-menu").getByRole("button").tap();
    await page.getByRole("menuitem", { name: "Split", exact: true }).tap();
    await expect(page.getByRole("region", { name: "Lit usage", exact: true })).toBeVisible();
    await toolbar.getByRole("button", { name: "Preview options", exact: true }).tap();
    await page
      .locator(".preview-options")
      .getByRole("button", { name: /^Auto height/ })
      .tap();
    await expect(
      page.locator(".preview-options").getByRole("button", { name: /^Auto height/ }),
    ).toHaveAccessibleName("Auto height · Selected");
    await expect(frame).toHaveAttribute("src", session!);
  });
});
