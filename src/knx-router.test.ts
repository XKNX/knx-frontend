import { describe, expect, it, vi } from "vitest";

import "./knx-router";
import type { KnxRouter } from "./knx-router";
import type { KnxStatusPage } from "./components/knx-status-page";
import type { KnxLocalizeKey } from "./localize/localize";
import { localize } from "./localize/localize";
import type { KNX } from "./types/knx";
import type { KnxStatusView } from "./views/status_view";
import "./views/entities_router";
import "./views/expose_router";

vi.mock("@ha/common/navigate", () => ({
  navigate: vi.fn(() => Promise.resolve(true)),
  goBack: vi.fn(),
}));
// Keep jsdom's missing ElementInternals and HA localization context out of routing tests.
vi.mock("@ha/components/ha-button", () => ({}));
vi.mock("@ha/components/ha-icon-button", () => ({}));
vi.mock("@ha/layouts/hass-subpage", () => ({}));

const routerAt = (tag: string, prefix: string, path: string) => {
  const router = document.createElement(tag) as KnxRouter;
  router.route = { prefix, path };
  router.hass = {
    localize: (key: string) => (key === "panel.notfound" ? "Page not found" : ""),
  } as any;
  // Like the panel's `knx.localize`, resolve against the current hass.
  router.knx = {
    localize: (key: KnxLocalizeKey, replace?: Record<string, any>) =>
      localize(router.hass, key, replace),
  } as unknown as KNX;
  return router;
};

const beforeRender = (router: KnxRouter, page: string) =>
  (router as any).routerOptions.beforeRender(page);

describe("KnxRouter", () => {
  it("redirects the empty page to the default page", () => {
    const router = routerAt("knx-router", "/knx", "");
    expect(beforeRender(router, "")).toBe("dashboard");
  });

  it("renders a known page as is", () => {
    const router = routerAt("knx-router", "/knx", "/info");
    expect(beforeRender(router, "info")).toBeUndefined();
  });

  it("redirects an unknown page to the not_found route", () => {
    const router = routerAt("knx-router", "/knx", "/foo");
    expect(beforeRender(router, "foo")).toBe("not_found");
    expect((router as any).routerOptions.routes.not_found?.tag).toBe("knx-not-found");
  });

  it.each([
    ["knx-router", "/knx", "/missing", "knx-not-found", "/knx/missing"],
    ["knx-entities-router", "/knx/entities", "/missing", "knx-not-found", "/knx/entities/missing"],
    ["knx-expose-router", "/knx/expose", "/missing", "knx-not-found", "/knx/expose/missing"],
    ["knx-router", "/knx", "/error", "knx-error", "Connection lost"],
  ])(
    "loads and renders %s at %s%s with its status detail",
    async (tag, prefix, path, pageTag, detail) => {
      const oldTitle = document.title;
      const oldState = window.history.state;
      window.history.replaceState({ message: "Connection lost" }, "");
      const router = routerAt(tag, prefix, path);
      document.body.appendChild(router);
      try {
        await (router as unknown as { pageRendered: Promise<void> }).pageRendered;
        const page = router.querySelector(pageTag) as KnxStatusView;
        expect(page).toBeInstanceOf(customElements.get(pageTag)!);
        await page.updateComplete;
        const status = page.shadowRoot?.querySelector("knx-status-page") as KnxStatusPage;
        expect(status.detail).toBe(detail);
        expect(document.title).toBe(
          pageTag === "knx-not-found"
            ? "Page not found - KNX - Home Assistant"
            : "KNX - Home Assistant",
        );
      } finally {
        router.remove();
        window.history.replaceState(oldState, "");
        document.title = oldTitle;
      }
    },
  );

  it("uses the translated tab title for a known page", () => {
    const router = routerAt("knx-router", "/knx", "/info");
    router.hass.localize = (key: string) =>
      key === "component.knx.config_panel.info.title" ? "Information" : key;
    (router as any).updatePageEl(document.createElement("knx-info"), undefined);
    expect(document.title).toBe("Information - KNX - Home Assistant");
  });

  it("keeps the existing title for a page without a tab or status title", () => {
    document.title = "Entities - KNX - Home Assistant";
    const router = routerAt("knx-entities-router", "/knx/entities", "/view");
    (router as any).updatePageEl(document.createElement("knx-entities-view"), undefined);
    expect(document.title).toBe("Entities - KNX - Home Assistant");
  });

  it("treats inherited object keys as unknown pages", () => {
    for (const page of ["constructor", "toString", "__proto__"]) {
      const router = routerAt("knx-router", "/knx", `/${page}`);
      expect(beforeRender(router, page)).toBe("not_found");
    }
  });

  it("passes the requested path to the not-found page", () => {
    const router = routerAt("knx-router", "/knx", "/foo/bar");
    beforeRender(router, "foo");

    const page = document.createElement("knx-not-found") as any;
    (router as any).updatePageEl(page, undefined);

    expect(page.requestedPath).toBe("/knx/foo/bar");
  });

  it("passes query and hash of the requested path to the not-found page", () => {
    window.history.replaceState(null, "", "/knx/foo?preset=light#step");
    try {
      const router = routerAt("knx-router", "/knx", "/foo");
      beforeRender(router, "foo");

      const page = document.createElement("knx-not-found") as any;
      (router as any).updatePageEl(page, undefined);

      expect(page.requestedPath).toBe("/knx/foo?preset=light#step");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it.each([
    ["knx-not-found", "Page not found - KNX - Home Assistant"],
    ["knx-error", "KNX - Home Assistant"],
  ])("replaces the previous page's tab title for %s", (tag, title) => {
    document.title = "Entities - KNX - Home Assistant";
    const router = routerAt("knx-router", "/knx", "/foo");
    (router as any).updatePageEl(document.createElement(tag), undefined);

    expect(document.title).toBe(title);
  });

  it("keeps the requested path through the redirect to not_found", () => {
    const router = routerAt("knx-router", "/knx", "/foo");
    beforeRender(router, "foo");
    router.route = { prefix: "/knx", path: "/not_found" };
    beforeRender(router, "not_found");

    const page = document.createElement("knx-not-found") as any;
    (router as any).updatePageEl(page, undefined);

    expect(page.requestedPath).toBe("/knx/foo");
  });

  it("forgets the requested path once a known page is rendered", () => {
    const router = routerAt("knx-router", "/knx", "/foo");
    beforeRender(router, "foo");
    router.route = { prefix: "/knx", path: "/info" };
    beforeRender(router, "info");
    router.route = { prefix: "/knx", path: "/not_found" };
    beforeRender(router, "not_found");

    const page = document.createElement("knx-not-found") as any;
    (router as any).updatePageEl(page, undefined);

    expect(page.requestedPath).toBeUndefined();
  });
});

describe.each([
  ["knx-entities-router", "/knx/entities", "view"],
  ["knx-expose-router", "/knx/expose", "view"],
])("%s", (tag, prefix, defaultPage) => {
  it("redirects the empty page to the default page", () => {
    const router = routerAt(tag, prefix, "");
    expect(beforeRender(router, "")).toBe(defaultPage);
  });

  it("redirects an unknown page to the not_found route", () => {
    const router = routerAt(tag, prefix, "/foo");
    expect(beforeRender(router, "foo")).toBe("not_found");
    expect((router as any).routerOptions.routes.not_found?.tag).toBe("knx-not-found");
  });
});
