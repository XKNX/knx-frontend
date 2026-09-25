import { afterEach, describe, expect, it, vi } from "vitest";
import { html, render } from "lit";

import "./knx-status-page";
import type { KnxStatusPage } from "./knx-status-page";

// HA's buttons, alert and subpage need browser APIs jsdom lacks (ElementInternals,
// the localize context); leave them undefined so they stay plain elements.
vi.mock("@ha/components/ha-button", () => ({}));
vi.mock("@ha/components/ha-icon-button", () => ({}));
vi.mock("@ha/components/ha-alert", () => ({}));
vi.mock("@ha/layouts/hass-subpage", () => ({}));

const clipboard = vi.hoisted(() => ({
  copyToClipboard: vi.fn(() => Promise.resolve()),
  showToast: vi.fn(),
}));
vi.mock("@ha/common/util/copy-clipboard", () => ({ copyToClipboard: clipboard.copyToClipboard }));
vi.mock("@ha/util/toast", () => ({ showToast: clipboard.showToast }));

describe("KnxStatusPage", () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
  });

  const mount = async (template: ReturnType<typeof html>) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    render(template, container);
    const element = container.querySelector("knx-status-page") as KnxStatusPage;
    await element.updateComplete;
    return element;
  };

  it("shows the eyebrow above the headline, then the description", async () => {
    const element = await mount(
      html`<knx-status-page
        .hass=${{ localize: (key: string) => key } as any}
        header="KNX"
        eyebrow="Page not found"
        headline="4/0/4"
        description="No receiver"
      ></knx-status-page>`,
    );
    const eyebrow = element.shadowRoot?.querySelector(".eyebrow");
    expect(eyebrow?.textContent?.trim()).toBe("Page not found");
    expect(eyebrow?.nextElementSibling?.textContent).toBe("4/0/4");
    expect(element.shadowRoot?.querySelector(".description")?.textContent).toBe("No receiver");
  });

  it("renders the bus scene with the requested variant", async () => {
    const element = await mount(
      html`<knx-status-page
        .hass=${{ localize: (key: string) => key } as any}
        header="KNX"
        headline="Error"
        variant="error"
      ></knx-status-page>`,
    );
    expect(element.shadowRoot?.querySelector("knx-bus-scene")?.getAttribute("variant")).toBe(
      "error",
    );
  });

  it("hands the rate unit to the bus scene", async () => {
    const element = await mount(
      html`<knx-status-page
        .hass=${{ localize: (key: string) => key } as any}
        header="KNX"
        headline="4/0/4"
        rate-unit="Telegramme/s"
      ></knx-status-page>`,
    );
    expect((element.shadowRoot?.querySelector("knx-bus-scene") as any).rateUnit).toBe(
      "Telegramme/s",
    );
  });

  describe("tapping anywhere on the page", () => {
    const pageWithButton = async () =>
      mount(
        html`<knx-status-page
          .hass=${{ localize: (key: string) => key } as any}
          header="KNX"
          headline="4/0/4"
          description="No receiver"
          ><ha-button id="action">Back</ha-button></knx-status-page
        >`,
      );
    const tap = (target: Element | null | undefined, button = 0) =>
      target?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, composed: true, button }),
      );

    it("fires a telegram on the scene", async () => {
      const element = await pageWithButton();
      const scene = element.shadowRoot?.querySelector("knx-bus-scene") as any;
      const fire = vi.spyOn(scene, "fire");
      tap(element.shadowRoot?.querySelector(".description"));
      tap(element.shadowRoot?.querySelector("h1"));
      expect(fire).toHaveBeenCalledTimes(2);
    });

    it("leaves the action buttons and secondary mouse buttons alone", async () => {
      const element = await pageWithButton();
      const scene = element.shadowRoot?.querySelector("knx-bus-scene") as any;
      const fire = vi.spyOn(scene, "fire");
      tap(element.querySelector("#action"));
      tap(element.shadowRoot?.querySelector(".description"), 2);
      expect(fire).not.toHaveBeenCalled();
    });
  });

  describe("technical detail", () => {
    it("shows the detail under its label, in monospace, without a copy button", async () => {
      const element = await mount(
        html`<knx-status-page
          .hass=${{ localize: (key: string) => key } as any}
          header="KNX"
          headline="4/0/4"
          detail-label="Requested path"
          detail="/knx/foo"
        ></knx-status-page>`,
      );
      const detail = element.shadowRoot?.querySelector(".detail");
      expect(detail?.querySelector(".detail-label")?.textContent?.trim()).toBe("Requested path");
      expect(detail?.querySelector("code")?.textContent).toBe("/knx/foo");
      expect(detail?.querySelector("ha-icon-button")).toBeNull();
    });

    it("omits the block without a detail", async () => {
      const element = await mount(
        html`<knx-status-page
          .hass=${{ localize: (key: string) => key } as any}
          header="KNX"
          headline="4/0/4"
          detail-label="Requested path"
        ></knx-status-page>`,
      );
      expect(element.shadowRoot?.querySelector(".detail")).toBeNull();
    });

    it("copies a copyable detail to the clipboard and says so", async () => {
      const element = await mount(
        html`<knx-status-page
          .hass=${{ localize: (key: string) => key } as any}
          header="KNX"
          headline="Error"
          detail-label="Error message"
          detail="Connection lost"
          copyable
        ></knx-status-page>`,
      );
      const button = element.shadowRoot?.querySelector(".detail ha-icon-button") as HTMLElement;
      expect(button.getAttribute("label")).toBe("ui.common.copy");
      button.click();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(clipboard.copyToClipboard).toHaveBeenCalledWith("Connection lost");
      expect(clipboard.showToast).toHaveBeenCalledWith(
        element,
        expect.objectContaining({ message: "ui.common.copied_clipboard" }),
      );
    });
  });

  it("places slotted content below the description", async () => {
    const element = await mount(
      html`<knx-status-page
        .hass=${{ localize: (key: string) => key } as any}
        header="KNX"
        headline="Error"
        ><ha-button id="action">Back</ha-button></knx-status-page
      >`,
    );
    const slot = element.shadowRoot?.querySelector("slot:not([name])") as HTMLSlotElement;
    expect(slot.assignedElements().map((el) => el.id)).toEqual(["action"]);
  });
});
