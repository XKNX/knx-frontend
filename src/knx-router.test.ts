import { describe, expect, it, vi } from "vitest";

import "./knx-router";
import type { KnxRouter } from "./knx-router";
import "./views/entities_router";
import "./views/expose_router";

vi.mock("@ha/common/navigate", () => ({ navigate: vi.fn(() => Promise.resolve(true)) }));

const routerAt = (tag: string, prefix: string, path: string) => {
  const router = document.createElement(tag) as KnxRouter;
  router.route = { prefix, path };
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

  it("passes the requested path to the not-found page", () => {
    const router = routerAt("knx-router", "/knx", "/foo/bar");
    beforeRender(router, "foo");

    const page = document.createElement("knx-not-found") as any;
    (router as any).updatePageEl(page, undefined);

    expect(page.requestedPath).toBe("/knx/foo/bar");
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
