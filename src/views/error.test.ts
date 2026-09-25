import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KNXError } from "./error";

// HA's button, alert and subpage need browser APIs jsdom lacks (ElementInternals,
// the localize context); leave them undefined so they stay plain elements.
vi.mock("@ha/components/ha-button", () => ({}));
vi.mock("@ha/components/ha-icon-button", () => ({}));
vi.mock("@ha/components/ha-alert", () => ({}));
vi.mock("@ha/layouts/hass-subpage", () => ({}));

const navigation = vi.hoisted(() => ({
  navigate: vi.fn(() => Promise.resolve(true)),
  goBack: vi.fn(),
}));
vi.mock("@ha/common/navigate", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...navigation,
}));

const fakeMainWindow = vi.hoisted(() => ({
  history: { state: null as { message?: string; retryPath?: string } | null },
  document: { title: "" },
}));
vi.mock("@ha/common/dom/get_main_window", () => ({ mainWindow: fakeMainWindow }));

describe("KNXError", () => {
  let element: KNXError;

  const mount = async () => {
    element = new KNXError();
    element.hass = { localize: (key: string) => key } as any;
    element.knx = { localize: (key: string) => key } as any;
    document.body.appendChild(element);
    await element.updateComplete;
  };

  beforeEach(() => {
    navigation.goBack.mockClear();
    navigation.navigate.mockClear();
    fakeMainWindow.history.state = {
      message: "Connection lost",
      retryPath: "/knx/entities/create/switch",
    };
  });

  afterEach(() => {
    element?.remove();
  });

  it("tells the error story with the error category above the headline", async () => {
    await mount();
    const page = element.shadowRoot?.querySelector("knx-status-page") as any;
    expect(page.getAttribute("variant")).toBe("error");
    expect(page.eyebrow).toBe("error_eyebrow");
    expect(page.rateUnit).toBe("status_rate_unit");
  });

  it("shows the error message from the history state as copyable detail", async () => {
    await mount();
    const page = element.shadowRoot?.querySelector("knx-status-page") as any;
    expect(page.detailLabel).toBe("error_message");
    expect(page.detail).toBe("Connection lost");
    expect(page.copyable).toBe(true);
    expect(element.shadowRoot?.querySelector("ha-alert")).toBeNull();
  });

  it("falls back to a generic message without history state", async () => {
    fakeMainWindow.history.state = null;
    await mount();
    expect((element.shadowRoot?.querySelector("knx-status-page") as any).detail).toBe(
      "ui.common.unknown_error",
    );
  });

  it("offers to try again, open the dashboard and report the problem", async () => {
    await mount();
    const buttons = [...(element.shadowRoot?.querySelectorAll("ha-button") ?? [])];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "status_try_again",
      "status_go_to_dashboard",
      "error_report",
    ]);
    expect(buttons.map((button) => button.getAttribute("appearance"))).toEqual([
      "filled",
      "plain",
      "plain",
    ]);
    (buttons[1] as HTMLElement).click();
    expect(navigation.navigate).toHaveBeenCalledWith("/knx");
    expect(buttons[2].getAttribute("href")).toBe("https://github.com/XKNX/knx-integration/issues");
    expect(buttons[2].getAttribute("target")).toBe("_blank");
  });

  it("tries again by returning to the page where it failed", async () => {
    await mount();
    (element.shadowRoot?.querySelector("ha-button[appearance='filled']") as HTMLElement).click();
    expect(navigation.navigate).toHaveBeenCalledWith("/knx/entities/create/switch", {
      replace: true,
    });
  });

  it("tries again by going back when the origin is unknown", async () => {
    fakeMainWindow.history.state = { message: "Connection lost" };
    await mount();
    const buttons = [...(element.shadowRoot?.querySelectorAll("ha-button") ?? [])];
    expect(buttons.map((button) => button.getAttribute("appearance"))).toEqual([
      "filled",
      "plain",
      "plain",
    ]);
    (buttons[0] as HTMLElement).click();
    expect(navigation.goBack).toHaveBeenCalledWith("/knx");
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
