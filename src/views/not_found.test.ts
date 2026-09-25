import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KnxNotFound } from "./not_found";

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

describe("KnxNotFound", () => {
  let element: KnxNotFound;

  beforeEach(async () => {
    navigation.navigate.mockClear();
    navigation.goBack.mockClear();
    element = new KnxNotFound();
    element.hass = { localize: (key: string) => key } as any;
    element.knx = { localize: (key: string) => key } as any;
    element.requestedPath = "/knx/foo";
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
  });

  it("tells the not-found story in plain words above the group address", () => {
    const page = element.shadowRoot?.querySelector("knx-status-page") as any;
    expect(page.getAttribute("variant")).toBe("not-found");
    expect(page.eyebrow).toBe("not_found_eyebrow");
    expect(page.headline).toBe("4/0/4");
    expect(page.rateUnit).toBe("not_found_rate_unit");
  });

  it("hands the path that was not found to the status page as detail", async () => {
    const page = element.shadowRoot?.querySelector("knx-status-page") as any;
    expect(page.detailLabel).toBe("not_found_requested_path");
    expect(page.detail).toBe("/knx/foo");
    expect(page.copyable).toBe(false);
    element.requestedPath = undefined;
    await element.updateComplete;
    expect(page.detail).toBeUndefined();
  });

  it("goes back with the pill button", () => {
    const buttons = [...(element.shadowRoot?.querySelectorAll("ha-button") ?? [])];
    expect(buttons.map((button) => button.getAttribute("appearance"))).toEqual(["filled", "plain"]);
    (buttons[0] as HTMLElement).click();
    expect(navigation.goBack).toHaveBeenCalledWith("/knx");
  });

  it("opens the dashboard with the text button", () => {
    const button = element.shadowRoot?.querySelector("ha-button[appearance='plain']");
    (button as HTMLElement).click();
    expect(navigation.navigate).toHaveBeenCalledWith("/knx");
  });
});
