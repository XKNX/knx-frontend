/** Filter pane slot ordering and close/clear requests; does not exercise HA dialog animations. */
import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { KnxTabsSubpageDataFilterPane } from "./knx-tabs-subpage-data-filter-pane";

/** Injects identity localization and renders a disconnected pane directly into its shadow root. */
const draw = (pane: KnxTabsSubpageDataFilterPane) => {
  // consumeLocalize takes the context value and keeps its `localize`.
  Reflect.set(pane, "_localize", { localize: (key: string) => key });
  const host = pane.attachShadow({ mode: "open" });
  render(pane["render"](), host, { host: pane });
  return host;
};

describe("KnxTabsSubpageDataFilterPane", () => {
  it("puts consumer actions between the header chip and the clear button", () => {
    const pane = new KnxTabsSubpageDataFilterPane();
    pane.count = 1;
    const header = draw(pane).querySelector(".header")!;
    expect(
      [...header.querySelectorAll("ha-filter-pane-chip, slot, ha-icon-button")].map((el) =>
        el instanceof HTMLSlotElement ? `slot:${el.name}` : el.localName,
      ),
    ).toEqual(["ha-filter-pane-chip", "slot:actions", "ha-icon-button"]);
  });

  it("hides the clear button without active filters", () => {
    const host = draw(new KnxTabsSubpageDataFilterPane());
    expect(host.querySelector('.header slot[name="actions"]')).not.toBeNull();
    expect(host.querySelector("ha-icon-button")).toBeNull();
  });

  it("puts consumer actions before the clear button in the narrow sheet header", () => {
    const pane = new KnxTabsSubpageDataFilterPane();
    pane.narrow = true;
    pane.count = 1;
    const dialog = draw(pane).querySelector("ha-adaptive-dialog")!;
    expect(
      [...dialog.children]
        .filter((el) => el.slot === "headerActionItems")
        .map((el) => el.className || el.localName),
    ).toEqual(["sheet-actions", "ha-icon-button"]);
    expect(dialog.querySelector('.sheet-actions > slot[name="actions"]')).not.toBeNull();
    expect(dialog.querySelector(".sheet-content > slot:not([name])")).not.toBeNull();
  });

  it("reports close and clear to the page", () => {
    const pane = new KnxTabsSubpageDataFilterPane();
    pane.count = 1;
    const host = draw(pane);
    const closed = vi.fn();
    const cleared = vi.fn();
    pane.addEventListener("close-filter-pane", closed);
    pane.addEventListener("clear-filter", cleared);
    host.querySelector("ha-filter-pane-chip")!.dispatchEvent(new Event("click"));
    host.querySelector("ha-icon-button")!.dispatchEvent(new Event("click"));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});
