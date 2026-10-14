import { describe, expect, it, vi } from "vitest";

import { KnxSelectorRow } from "./knx-selector-row";
import type { KnxHaSelector } from "../types/schema";

vi.mock("@ha/components/ha-selector/ha-selector", () => ({}));

const DURATION_SELECTOR: KnxHaSelector = {
  type: "ha_selector",
  name: "reset_after",
  selector: { duration: { enable_day: true, enable_millisecond: true } },
};

const NUMBER_SELECTOR: KnxHaSelector = {
  type: "ha_selector",
  name: "brightness",
  required: true,
  selector: { number: { min: 0, max: 100, mode: "box" } },
};

const mount = async (selector: KnxHaSelector, value: unknown) => {
  const row = new KnxSelectorRow();
  row.hass = { localize: () => "" } as unknown as typeof row.hass;
  row.key = selector.name;
  row.selector = selector;
  row.value = value;
  document.body.append(row);
  await row.updateComplete;
  const haSelector = row.shadowRoot!.querySelector("ha-selector:not(.optional-switch)") as
    (HTMLElement & { value: unknown }) | null;
  const emitted: unknown[] = [];
  row.addEventListener("value-changed", (event) => emitted.push(event.detail.value));
  return { row, haSelector, emitted };
};

describe("knx-selector-row duration codec", () => {
  it("shows stored seconds as duration data and emits seconds", async () => {
    const { row, haSelector, emitted } = await mount(DURATION_SELECTOR, 90_001.5);
    try {
      expect(haSelector!.value).toEqual({
        days: 1,
        hours: 1,
        minutes: 0,
        seconds: 1,
        milliseconds: 500,
      });
      haSelector!.dispatchEvent(
        new CustomEvent("value-changed", {
          detail: { value: { days: 1, hours: 1, minutes: 0, seconds: 2, milliseconds: 250 } },
        }),
      );
      expect(emitted).toEqual([90_002.25]);
    } finally {
      row.remove();
    }
  });

  it("keeps zero enabled", async () => {
    const { row, haSelector } = await mount(DURATION_SELECTOR, 0);
    try {
      expect(row["_enabled"]).toBe(true);
      expect(haSelector!.value).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        milliseconds: 0,
      });
    } finally {
      row.remove();
    }
  });

  it("emits undefined when cleared", async () => {
    const { row, haSelector, emitted } = await mount(DURATION_SELECTOR, 5);
    try {
      haSelector!.dispatchEvent(new CustomEvent("value-changed", { detail: { value: undefined } }));
      expect(emitted).toEqual([undefined]);
    } finally {
      row.remove();
    }
  });

  it("treats null and undefined as unset for the optional switch", async () => {
    const { row } = await mount(DURATION_SELECTOR, null);
    try {
      expect(row["_enabled"]).toBe(false);
      expect(row.shadowRoot!.querySelector("ha-selector:not(.optional-switch)")).toBeNull();
    } finally {
      row.remove();
    }
  });

  it("passes a number selector value through", async () => {
    const { row, haSelector, emitted } = await mount(NUMBER_SELECTOR, 40);
    try {
      expect(haSelector!.value).toBe(40);
      haSelector!.dispatchEvent(new CustomEvent("value-changed", { detail: { value: 41 } }));
      expect(emitted).toEqual([41]);
    } finally {
      row.remove();
    }
  });
});
