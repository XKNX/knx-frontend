/** Composition and event contracts, rendered directly without Lit's update lifecycle. */
import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "@ha/types";
import { KnxTabsSubpageData } from "./knx-tabs-subpage-data";

/** Renders a fresh, disconnected view with identity localization; returns its shadow root. */
const draw = (view: KnxTabsSubpageData) => {
  view.hass = { localize: (key: string) => key } as unknown as HomeAssistant;
  const host = view.attachShadow({ mode: "open" });
  Reflect.set(view, "renderRoot", host);
  render(view["render"](), host, { host: view });
  return host;
};

describe("KnxTabsSubpageData", () => {
  it("forwards the back path to HA", () => {
    const view = new KnxTabsSubpageData();
    Reflect.set(view, "backPath", "/knx");
    const host = draw(view);
    expect(host.querySelector("hass-tabs-subpage")!.backPath).toBe("/knx");
  });

  it("renders the HA page and forwards free content without a table", () => {
    const host = draw(new KnxTabsSubpageData());
    expect(host.querySelector("hass-tabs-subpage")).not.toBeNull();
    expect(host.querySelector("knx-tabs-subpage-data-toolbar")).not.toBeNull();
    expect(host.querySelector("ha-data-table")).toBeNull();
    expect(host.querySelector(".content > .content-body > slot:not([name])")).not.toBeNull();
    expect(
      [...host.querySelectorAll("knx-tabs-subpage-data-toolbar > slot")].map(
        (slot) => `${slot.getAttribute("name")}:${slot.getAttribute("slot")}`,
      ),
    ).toEqual(["toolbar-leading:leading", "toolbar-search:search", "toolbar-trailing:trailing"]);
  });

  it("collapses the active filters row until chips are slotted", () => {
    const host = draw(new KnxTabsSubpageData());
    const row = host.querySelector<HTMLElement>(
      'knx-tabs-subpage-data-toolbar > .active-filters[slot="summary"]',
    )!;
    expect(row.hidden).toBe(true);
    expect(row.querySelector('slot[name="active-filters"]')).not.toBeNull();
  });

  it("places banner, content and footers without visibility switches", () => {
    const host = draw(new KnxTabsSubpageData());
    const main = host.querySelector(".main")!;
    expect(
      [...main.children].map((el) => el.className || el.getAttribute("name") || el.localName),
    ).toEqual(["knx-tabs-subpage-data-toolbar", "banner", "body", "footer"]);
    expect(main.querySelector('.banner > slot[name="banner"]')).not.toBeNull();
    const content = host.querySelector(".content")!;
    expect([...content.children].map((el) => el.className || el.getAttribute("name"))).toEqual([
      "content-body",
      "content-footer",
    ]);
  });

  it("places the sidebar slot right of the content without state of its own", () => {
    const host = draw(new KnxTabsSubpageData());
    const body = host.querySelector(".body")!;
    expect([...body.children].map((el) => el.className || el.getAttribute("name"))).toEqual([
      "content",
      "sidebar",
    ]);
    expect(host.querySelectorAll('slot[name="sidebar"]')).toHaveLength(1);
  });

  it("styles directly slotted input chips like the toolbar chips", () => {
    const styles = KnxTabsSubpageData.styles.cssText;
    expect(styles).toContain('::slotted(ha-input-chip[slot="active-filters"])');
    expect(styles).toContain("--md-input-chip-container-shape: 10px");
  });

  it("leaves the HA title fallback in place until a header is supplied", () => {
    const view = new KnxTabsSubpageData();
    const host = draw(view);
    const header = host.querySelector<HTMLSlotElement>('slot[name="header"]')!;
    expect(header.slot).not.toBe("header");
    vi.spyOn(header, "assignedElements").mockReturnValue([document.createElement("span")]);
    header.dispatchEvent(new Event("slotchange"));
    render(view["render"](), host, { host: view });
    expect(host.querySelector<HTMLSlotElement>('slot[name="header"]')!.slot).toBe("header");
  });

  it("renders no filter UI when hasFilters is false", () => {
    const view = new KnxTabsSubpageData();
    view.showFilters = true;
    const host = draw(view);
    expect(host.querySelector("knx-tabs-subpage-data-filter-pane, ha-filter-pane-chip")).toBeNull();
  });

  it("moves slotted search into the narrow header unless a custom header is supplied", () => {
    const view = new KnxTabsSubpageData();
    const host = draw(view);
    const search = document.createElement("input");
    search.slot = "toolbar-search";
    view.append(search);
    host.querySelector('slot[name="toolbar-search"]')!.dispatchEvent(new Event("slotchange"));
    render(view["render"](), host, { host: view });
    expect(host.querySelector('slot[name="toolbar-search"]')!.parentElement!.localName).toBe(
      "knx-tabs-subpage-data-toolbar",
    );

    view.narrow = true;
    render(view["render"](), host, { host: view });
    expect(host.querySelectorAll('slot[name="toolbar-search"]')).toHaveLength(1);
    expect(host.querySelector('slot[name="toolbar-search"]')!.parentElement!.slot).toBe("header");

    const header = document.createElement("span");
    header.slot = "header";
    view.append(header);
    host.querySelector('slot[name="header"]')!.dispatchEvent(new Event("slotchange"));
    render(view["render"](), host, { host: view });
    expect(host.querySelector('slot[name="toolbar-search"]')!.parentElement!.localName).toBe(
      "knx-tabs-subpage-data-toolbar",
    );

    header.remove();
    host.querySelector('slot[name="header"]')!.dispatchEvent(new Event("slotchange"));
    search.remove();
    host.querySelector('slot[name="toolbar-search"]')!.dispatchEvent(new Event("slotchange"));
    render(view["render"](), host, { host: view });
    expect(host.querySelector(".header-search")).toBeNull();
  });

  it("shows active filters only while the consumer supplies chips", () => {
    const view = new KnxTabsSubpageData();
    const host = draw(view);
    const chip = document.createElement("ha-input-chip");
    chip.slot = "active-filters";
    view.append(chip);
    const slot = host.querySelector('slot[name="active-filters"]')!;
    slot.dispatchEvent(new Event("slotchange"));
    render(view["render"](), host, { host: view });
    expect(host.querySelector<HTMLElement>(".active-filters")!.hidden).toBe(false);

    chip.remove();
    slot.dispatchEvent(new Event("slotchange"));
    render(view["render"](), host, { host: view });
    expect(host.querySelector<HTMLElement>(".active-filters")!.hidden).toBe(true);
  });

  it("renders one pane with consumer filters and result count", () => {
    const view = new KnxTabsSubpageData();
    view.hasFilters = true;
    view.showFilters = true;
    view.activeFilterCount = 2;
    view.resultCount = 7;
    const host = draw(view);
    const pane = host.querySelector("knx-tabs-subpage-data-filter-pane")!;
    expect(host.querySelectorAll("knx-tabs-subpage-data-filter-pane")).toHaveLength(1);
    expect(pane.querySelector('slot[name="filter-pane"]')).not.toBeNull();
    expect(pane.count).toBe(2);
    expect(pane.resultCount).toBe(7);
  });

  it("forwards pane actions into the open pane in both layouts", () => {
    const view = new KnxTabsSubpageData();
    view.hasFilters = true;
    const host = draw(view);
    expect(host.querySelector('slot[name="filter-pane-actions"]')).toBeNull();
    view.showFilters = true;
    for (const narrow of [false, true]) {
      view.filterPaneNarrow = narrow;
      render(view["render"](), host, { host: view });
      const actions = host.querySelectorAll('slot[name="filter-pane-actions"]');
      expect(actions).toHaveLength(1);
      expect(actions[0].parentElement!.localName).toBe("knx-tabs-subpage-data-filter-pane");
      expect(actions[0].slot).toBe("actions");
    }
  });

  it("follows the component width unless filterPaneNarrow overrides it", () => {
    const view = new KnxTabsSubpageData();
    view.hasFilters = true;
    view.showFilters = true;
    const host = draw(view);
    view["_showPaneController"].handleChanges([
      { contentRect: { width: 725 } } as unknown as ResizeObserverEntry,
    ]);
    render(view["render"](), host, { host: view });
    expect(host.querySelector("knx-tabs-subpage-data-filter-pane")!.narrow).toBe(true);
    view["_showPaneController"].handleChanges([
      { contentRect: { width: 900 } } as unknown as ResizeObserverEntry,
    ]);
    render(view["render"](), host, { host: view });
    expect(host.querySelector("knx-tabs-subpage-data-filter-pane")!.narrow).toBe(false);
    view["_showPaneController"].handleChanges([
      { contentRect: { width: 725 } } as unknown as ResizeObserverEntry,
    ]);
    view.filterPaneNarrow = false;
    render(view["render"](), host, { host: view });
    expect(host.querySelector("knx-tabs-subpage-data-filter-pane")!.narrow).toBe(false);
    expect(host.querySelectorAll("knx-tabs-subpage-data-filter-pane")).toHaveLength(1);
    view.filterPaneNarrow = true;
    render(view["render"](), host, { host: view });
    expect(host.querySelector("knx-tabs-subpage-data-filter-pane")!.narrow).toBe(true);
    expect(host.querySelectorAll('slot[name="filter-pane"]')).toHaveLength(1);
  });

  it("reports a user close once and leaves filter values to the consumer", () => {
    const view = new KnxTabsSubpageData();
    view.hasFilters = true;
    view.showFilters = true;
    view.activeFilterCount = 2;
    const host = draw(view);
    const changed = vi.fn();
    const cleared = vi.fn();
    view.addEventListener("show-filters-changed", changed);
    view.addEventListener("clear-filter", cleared);
    const pane = host.querySelector("knx-tabs-subpage-data-filter-pane")!;
    pane.dispatchEvent(new Event("close-filter-pane"));
    expect(view.showFilters).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    expect((changed.mock.calls[0][0] as CustomEvent).detail).toEqual({ value: false });
    pane.dispatchEvent(new Event("close-filter-pane"));
    expect(changed).toHaveBeenCalledTimes(1);
    pane.dispatchEvent(new Event("clear-filter", { bubbles: true, composed: true }));
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(view.activeFilterCount).toBe(2);
  });

  it("opens filters from the toolbar chip exactly once", () => {
    const view = new KnxTabsSubpageData();
    view.hasFilters = true;
    const host = draw(view);
    const changed = vi.fn();
    view.addEventListener("show-filters-changed", changed);
    host.querySelector("ha-filter-pane-chip")!.dispatchEvent(new Event("click"));
    expect(view.showFilters).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    expect((changed.mock.calls[0][0] as CustomEvent).detail).toEqual({ value: true });
  });

  it("does not put dialog semantics on the non-focusable chip wrapper", () => {
    const view = new KnxTabsSubpageData();
    view.hasFilters = true;
    const chip = draw(view).querySelector("ha-filter-pane-chip")!;
    expect(chip.hasAttribute("aria-haspopup")).toBe(false);
    expect(chip.hasAttribute("aria-expanded")).toBe(false);
  });
});
