import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextProvider } from "@lit/context";

import { internationalizationContext } from "@ha/data/context";
import type { RelatedExpose } from "../../data/exposes-by-group";
import "./knx-data-table-related-label";

// HA elements are not needed to check the rendered labels - keep them plain elements.
vi.mock("@ha/components/chips/ha-chip-set", () => ({}));
vi.mock("@ha/components/ha-dropdown", () => ({}));
vi.mock("@ha/components/ha-dropdown-item", () => ({}));
vi.mock("@ha/components/ha-label", () => ({}));
vi.mock("@ha/components/ha-state-icon", () => ({}));
vi.mock("@ha/components/ha-svg-icon", () => ({}));

const createLabel = async (exposes: RelatedExpose[]) => {
  const host = document.createElement("div");
  new ContextProvider(host, {
    context: internationalizationContext,
    initialValue: { localize: (key: string) => key } as any,
  });
  document.body.appendChild(host);
  const element = document.createElement("knx-data-table-related-label");
  element.exposes = exposes;
  host.appendChild(element);
  await element.updateComplete;
  return element.shadowRoot!;
};

describe("knx-data-table-related-label", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("links a UI expose to its editor", async () => {
    const root = await createLabel([{ entity_id: "sensor.outdoor", ui: true }]);

    expect(root.querySelector("a")!.getAttribute("href")).toBe("/knx/expose/edit/sensor.outdoor");
    expect(root.querySelector("ha-label")!.classList.contains("yaml")).toBe(false);
  });

  it("marks a YAML expose and does not link it", async () => {
    const root = await createLabel([{ entity_id: "sensor.outdoor", ui: false }]);
    const label = root.querySelector("ha-label") as any;

    expect(root.querySelector("a")).toBeNull();
    expect(label.classList.contains("yaml")).toBe(true);
    expect(label.description).toContain("YAML");
  });

  it("shows the UI and the YAML expose of one entity separately", async () => {
    const root = await createLabel([
      { entity_id: "sensor.outdoor", ui: true },
      { entity_id: "sensor.outdoor", ui: false },
    ]);

    expect(root.querySelectorAll("ha-label")).toHaveLength(2);
    expect(root.querySelectorAll("a")).toHaveLength(1);
  });
});
