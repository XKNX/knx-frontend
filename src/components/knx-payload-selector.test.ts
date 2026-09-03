import { describe, it, expect, beforeEach } from "vitest";

import { KnxPayloadSelector } from "./knx-payload-selector";
import type { DPTMetadata } from "../types/websocket";

const dptMeta = (overrides: Partial<DPTMetadata>): DPTMetadata =>
  ({
    dpt_class: "numeric",
    main: 0,
    sub: null,
    name: null,
    unit: null,
    sensor_device_class: null,
    sensor_state_class: null,
    payload_length: 1,
    ...overrides,
  }) as DPTMetadata;

// DPT 1, 2 and 3 are packed into the APDU header - the backend reports their
// `payload_length` as a bit count, everything else as a byte count.
const DPT_METADATA: Record<string, DPTMetadata> = {
  "1.001": dptMeta({
    dpt_class: "enum",
    main: 1,
    sub: 1,
    payload_length: 1,
    options: ["off", "on"],
  }),
  "2.008": dptMeta({
    dpt_class: "complex",
    main: 2,
    sub: 8,
    payload_length: 2,
    schema: [
      { name: "control", type: "boolean", required: true },
      { name: "value", type: "enum", required: true, options: ["up", "down"] },
    ],
  }),
  "2.001": dptMeta({
    dpt_class: "complex",
    main: 2,
    sub: 1,
    payload_length: 2,
    schema: [
      { name: "control", type: "boolean", required: true },
      { name: "value", type: "enum", required: true, options: ["off", "on"] },
    ],
  }),
  "3.007": dptMeta({
    dpt_class: "complex",
    main: 3,
    sub: 7,
    payload_length: 4,
    schema: [
      { name: "control", type: "boolean", required: true },
      { name: "step_code", type: "integer", required: true, value_min: 0, value_max: 7 },
    ],
  }),
  "5.001": dptMeta({ main: 5, sub: 1, payload_length: 1, min: 0, max: 100 }),
  "9.001": dptMeta({ main: 9, sub: 1, payload_length: 2, min: -273, max: 670760 }),
};

describe("KnxPayloadSelector", () => {
  let element: KnxPayloadSelector;

  beforeEach(() => {
    element = new KnxPayloadSelector();
    element.knx = { dptMetadata: DPT_METADATA } as any;
    element.hass = { localize: (key: string) => key } as any;
    element.required = true;
  });

  describe("_rawPayloadMax", () => {
    it.each([
      ["1.001", 1n],
      ["2.008", 3n],
      ["3.007", 15n],
    ])("uses 2**bits - 1 for APCI packed DPT %s", (dpt, expected) => {
      element.dpt = dpt;
      expect((element as any)._rawPayloadMax()).toBe(expected);
    });

    it("falls back to the DPTBinary limit when metadata is missing", () => {
      element.dpt = "2.099";
      expect((element as any)._rawPayloadMax()).toBe(63n);
    });

    it.each([
      [1, 255n],
      [2, 65535n],
    ])("uses the byte length for other DPTs (%i byte)", (rawLength, expected) => {
      element.dpt = rawLength === 1 ? "5.001" : "9.001";
      element.rawLength = rawLength;
      expect((element as any)._rawPayloadMax()).toBe(expected);
    });
  });

  describe("_clampRawPayload", () => {
    it("keeps the full 2 bit range of DPT 2.x", () => {
      element.dpt = "2.008";
      expect((element as any)._clampRawPayload("0x3")).toBe("0x3");
    });

    it("clamps above the DPT maximum", () => {
      element.dpt = "2.008";
      expect((element as any)._clampRawPayload("0x4")).toBe("0x3");
    });
  });

  describe("_typedValueForDpt", () => {
    it("defaults required complex fields so the control-off state is stored", () => {
      element.dpt = "2.008";
      expect((element as any)._typedValueForDpt(DPT_METADATA["2.008"])).toEqual({
        control: false,
        value: "up",
      });
    });

    it("keeps a configured value that still fits the DPT", () => {
      element.dpt = "2.008";
      (element as any)._typedValue = { control: true, value: "down" };
      expect((element as any)._typedValueForDpt(DPT_METADATA["2.008"])).toEqual({
        control: true,
        value: "down",
      });
    });

    it("fills in required fields missing from a configured value", () => {
      element.dpt = "2.008";
      (element as any)._typedValue = { value: "down" };
      expect((element as any)._typedValueForDpt(DPT_METADATA["2.008"])).toEqual({
        control: false,
        value: "down",
      });
    });

    it("resets a value whose enum option doesn't fit the DPT", () => {
      element.dpt = "2.008";
      (element as any)._typedValue = { control: true, value: "on" }; // DPT 2.001 value
      expect((element as any)._typedValueForDpt(DPT_METADATA["2.008"])).toEqual({
        control: false,
        value: "up",
      });
    });

    it("resets a value whose fields don't exist in the DPT schema", () => {
      element.dpt = "2.008";
      (element as any)._typedValue = { control: true, step_code: 3 }; // DPT 3.007 value
      expect((element as any)._typedValueForDpt(DPT_METADATA["2.008"])).toEqual({
        control: false,
        value: "up",
      });
    });
  });

  describe("_applyDptTypedDefaults", () => {
    it("keeps a loaded complex value instead of resetting it to defaults", () => {
      element.dpt = "2.008";
      element.value = { value: { control: true, value: "down" } };
      (element as any)._typedValue = { control: true, value: "down" };
      (element as any)._mode = "typed";
      (element as any)._rawLength = 0; // already clamped, so only the typed value can trigger an emit

      const emitted: any[] = [];
      element.addEventListener("value-changed", (ev: any) => emitted.push(ev.detail.value));
      (element as any)._applyDptTypedDefaults();

      expect((element as any)._typedValue).toEqual({ control: true, value: "down" });
      expect(emitted).toHaveLength(0); // no redundant update
    });

    it("clamps the reported bit count to a raw payload length of 0", () => {
      element.dpt = "2.008";
      (element as any)._rawLength = 2;
      (element as any)._applyDptTypedDefaults();
      expect((element as any)._rawLength).toBe(0);
    });
  });

  describe("_modeChanged", () => {
    it("seeds DPT defaults when switching to typed mode without a cached value", () => {
      element.dpt = "2.008";
      (element as any)._mode = "raw";
      (element as any)._rawPayload = "0x2";

      const emitted: any[] = [];
      element.addEventListener("value-changed", (ev: any) => emitted.push(ev.detail.value));
      const noop = () => undefined;
      (element as any)._modeChanged({ detail: { value: "typed" }, stopPropagation: noop });

      expect((element as any)._typedValue).toEqual({ control: false, value: "up" });
      expect(emitted).toEqual([{ value: { control: false, value: "up" } }]);
    });
  });
});
