import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextProvider } from "@lit/context";

import { internationalizationContext } from "@ha/data/context";
import type { GASchema } from "../types/entity_data";
import type { GASelectorOptions } from "../types/schema";
import type { DPTMetadata, GroupAddress, KNXProject } from "../types/websocket";

import { GroupAddressSelector } from "./knx-group-address-selector";

// HA's buttons and input need browser APIs jsdom lacks (ElementInternals); leave them
// undefined so they stay plain elements.
vi.mock("@ha/components/ha-icon-button", () => ({}));
vi.mock("@ha/components/input/ha-input", () => ({}));

const dptMeta = (main: number, sub: number, dpt_class: string): DPTMetadata =>
  ({ main, sub, dpt_class, payload_length: 1 }) as unknown as DPTMetadata;

const DPT_METADATA: Record<string, DPTMetadata> = {
  "1.001": dptMeta(1, 1, "enum"),
  "5.001": dptMeta(5, 1, "numeric"),
  "9.001": dptMeta(9, 1, "numeric"),
};

const groupAddress = (address: string, main: number, sub: number): GroupAddress =>
  ({ address, name: address, dpt: { main, sub } }) as unknown as GroupAddress;

const LIGHT = groupAddress("1/0/1", 1, 1);
const DIMMER = groupAddress("1/0/2", 5, 1);
const TEMPERATURE = groupAddress("1/0/3", 9, 1);

const PROJECT = {
  group_addresses: Object.fromEntries([LIGHT, DIMMER, TEMPERATURE].map((ga) => [ga.address, ga])),
} as unknown as KNXProject;

const DPT_CLASSES = ["numeric", "enum", "string", "complex"];

// The selector and its children consume HA's localize context.
const createHost = () => {
  const host = document.createElement("div");
  new ContextProvider(host, {
    context: internationalizationContext,
    initialValue: { localize: (key: string) => key } as any,
  });
  document.body.appendChild(host);
  return host;
};

const createSelector = async (config: GASchema, options: Partial<GASelectorOptions> = {}) => {
  const element = new GroupAddressSelector();
  element.knx = { dptMetadata: DPT_METADATA } as any;
  (element as any)._projectData = PROJECT;
  element.key = "ga";
  element.options = { write: { required: true }, dptClasses: DPT_CLASSES, ...options };
  element.config = config;
  const emitted: (GASchema | undefined)[] = [];
  element.addEventListener("value-changed", (ev) => {
    emitted.push((ev as CustomEvent).detail.value);
  });
  createHost().appendChild(element);
  await element.updateComplete;
  return { element, emitted };
};

type Selector = Awaited<ReturnType<typeof createSelector>>;

const addresses = ({ element }: Selector) => element.filteredGroupAddresses.map((ga) => ga.address);

const child = ({ element }: Selector, tag: string) =>
  element.shadowRoot!.querySelector(tag) as HTMLElement;

const change = async ({ element }: Selector, target: HTMLElement, value: unknown) => {
  target.dispatchEvent(new CustomEvent("value-changed", { detail: { value } }));
  await element.updateComplete;
};

const pickAddress = (selector: Selector, address: string) =>
  change(selector, child(selector, "knx-single-address-selector"), address);

const pickDpt = (selector: Selector, dpt: string) =>
  change(selector, child(selector, "knx-dpt-dialog-selector"), dpt);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("knx-group-address-selector", () => {
  describe("with a DPT derived from the group address", () => {
    it("narrows the search to that DPT by default", async () => {
      const selector = await createSelector({});
      await pickAddress(selector, LIGHT.address);

      expect(selector.element.config).toEqual({ write: LIGHT.address, dpt: "1.001" });
      expect(selector.element.dptSelectorDisabled).toBe(true);
      expect(addresses(selector)).toEqual([LIGHT.address]);
    });

    describe("when the DPT follows the group address", () => {
      const options = { dptFollowsGroupAddress: true };

      it("keeps every valid address searchable", async () => {
        const selector = await createSelector({}, options);
        await pickAddress(selector, LIGHT.address);

        expect(selector.element.config).toEqual({ write: LIGHT.address, dpt: "1.001" });
        expect(selector.element.dptSelectorDisabled).toBe(true);
        expect(addresses(selector)).toEqual([LIGHT.address, DIMMER.address, TEMPERATURE.address]);
      });

      it("derives the DPT again from the next picked address", async () => {
        const selector = await createSelector({}, options);
        await pickAddress(selector, LIGHT.address);
        await pickAddress(selector, DIMMER.address);

        expect(selector.element.config).toEqual({ write: DIMMER.address, dpt: "5.001" });
        expect(selector.emitted[selector.emitted.length - 1]).toEqual({
          write: DIMMER.address,
          dpt: "5.001",
        });
      });

      it("treats a prefilled DPT matching the address as derived", async () => {
        const selector = await createSelector({ write: LIGHT.address, dpt: "1.001" }, options);

        expect(addresses(selector)).toEqual([LIGHT.address, DIMMER.address, TEMPERATURE.address]);

        await pickAddress(selector, TEMPERATURE.address);
        expect(selector.element.config).toEqual({ write: TEMPERATURE.address, dpt: "9.001" });
      });
    });
  });

  describe("with a DPT the user chose", () => {
    const options = { dptFollowsGroupAddress: true };

    it("narrows the search to that DPT", async () => {
      const selector = await createSelector({}, options);
      await pickAddress(selector, "7/7/7"); // not in the project, so no DPT is derived
      expect(selector.element.config).toEqual({ write: "7/7/7" });

      await pickDpt(selector, "5.001");
      expect(selector.element.dptSelectorDisabled).toBe(false);
      expect(addresses(selector)).toEqual([DIMMER.address]);
    });

    it("keeps that DPT when prefilled", async () => {
      const selector = await createSelector({ write: "7/7/7", dpt: "5.001" }, options);

      expect(addresses(selector)).toEqual([DIMMER.address]);
    });
  });
});
