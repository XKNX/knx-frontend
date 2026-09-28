/** Toolbar region visibility and search state with Lit updates. */
import { beforeEach, describe, expect, it } from "vitest";
import { KnxTabsSubpageDataToolbar } from "./knx-tabs-subpage-data-toolbar";

/** Waits one task for asynchronous slotchange delivery and the resulting Lit update. */
const nextSlotChange = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve);
  });

describe("KnxTabsSubpageDataToolbar", () => {
  let element: KnxTabsSubpageDataToolbar;

  beforeEach(async () => {
    element = new KnxTabsSubpageDataToolbar();
    document.body.append(element);
    await element.updateComplete;
  });

  it("exposes semantic slots without rendering controls", () => {
    expect(element.shadowRoot!.querySelector('[role="toolbar"]')).not.toBeNull();
    expect([...element.shadowRoot!.querySelectorAll("slot")].map((slot) => slot.name)).toEqual([
      "leading",
      "search",
      "trailing",
      "summary",
    ]);
    expect(element.shadowRoot!.querySelectorAll("button, input")).toHaveLength(0);
  });

  it("assigns optional summary content without configuration", async () => {
    const summary = document.createElement("div");
    summary.slot = "summary";
    element.append(summary);
    await element.updateComplete;

    const slot = element.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="summary"]')!;
    expect(slot.assignedElements()).toEqual([summary]);
  });

  it("hides the primary row until leading, search, or trailing content exists", async () => {
    const primary = element.shadowRoot!.querySelector<HTMLElement>(".primary")!;
    expect(primary.hidden).toBe(true);
    const summary = document.createElement("div");
    summary.slot = "summary";
    element.append(summary);
    await nextSlotChange();
    expect(primary.hidden).toBe(true);
    const action = document.createElement("button");
    action.slot = "trailing";
    element.append(action);
    await nextSlotChange();
    expect(primary.hidden).toBe(false);
    action.remove();
    await nextSlotChange();
    expect(primary.hidden).toBe(true);
  });

  it("initializes the searchless state and follows search controls being added and removed", async () => {
    expect(element.hasAttribute("search-hidden")).toBe(true);
    const action = document.createElement("button");
    action.slot = "trailing";
    element.append(action);
    await nextSlotChange();
    expect(element.hasAttribute("search-hidden")).toBe(true);

    const search = document.createElement("input");
    search.slot = "search";
    element.append(search);
    await nextSlotChange();
    expect(element.hasAttribute("search-hidden")).toBe(false);
    search.remove();
    await nextSlotChange();
    expect(element.hasAttribute("search-hidden")).toBe(true);
  });

  it("keeps narrow-layout summaries on one scrollable line", () => {
    const styles = KnxTabsSubpageDataToolbar.styles.cssText;
    expect(styles).toContain('::slotted([slot="summary"])');
    expect(styles).toContain("display: flex");
    expect(styles).toContain("white-space: nowrap");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain("scrollbar-width: none");
    expect(styles).toContain("::-webkit-scrollbar");
  });
});
