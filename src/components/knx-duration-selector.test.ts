import { describe, expect, it } from "vitest";

import { KnxDurationSelector } from "./knx-duration-selector";

describe("KNX Duration selector", () => {
  it("adapts seconds to the Duration selector and emits seconds", async () => {
    const duration = new KnxDurationSelector();
    duration.value = 90_001.5;
    duration.selector = {
      duration: { allow_negative: false, enable_day: true, enable_millisecond: true },
    };
    document.body.append(duration);
    try {
      await duration.updateComplete;
      const haSelector = duration.shadowRoot!.querySelector("ha-selector") as HTMLElement & {
        value: unknown;
      };
      expect(haSelector.value).toEqual({
        days: 1,
        hours: 1,
        minutes: 0,
        seconds: 1,
        milliseconds: 500,
      });
      const values: unknown[] = [];
      duration.addEventListener("value-changed", (event) => values.push(event.detail.value));
      haSelector.dispatchEvent(
        new CustomEvent("value-changed", {
          detail: { value: { days: 1, hours: 1, minutes: 0, seconds: 2, milliseconds: 250 } },
          bubbles: true,
          composed: true,
        }),
      );
      expect(values).toEqual([90_002.25]);
    } finally {
      duration.remove();
    }
  });

  it("distinguishes zero seconds from an unset Duration", async () => {
    const duration = new KnxDurationSelector();
    duration.value = 0;
    duration.selector = { duration: { allow_negative: false } };
    document.body.append(duration);
    try {
      await duration.updateComplete;
      const haSelector = duration.shadowRoot!.querySelector("ha-selector") as HTMLElement & {
        value: unknown;
      };
      expect(haSelector.value).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        milliseconds: 0,
      });
      const values: unknown[] = [];
      duration.addEventListener("value-changed", (event) => values.push(event.detail.value));
      haSelector.dispatchEvent(
        new CustomEvent("value-changed", { detail: { value: { seconds: 0 } } }),
      );
      haSelector.dispatchEvent(new CustomEvent("value-changed", { detail: { value: undefined } }));
      expect(values).toEqual([0, undefined]);
    } finally {
      duration.remove();
    }
  });
});
