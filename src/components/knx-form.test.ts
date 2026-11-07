import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextProvider } from "@lit/context";

import { internationalizationContext } from "@ha/data/context";
import type { GroupSelect, SelectorSchema } from "../types/schema";

import { KnxForm } from "./knx-form";

// HA's buttons and input need browser APIs jsdom lacks (ElementInternals); leave the button
// undefined so it stays a plain element, and give the input an inert base class for the
// HA components that extend it.
vi.mock("@ha/components/ha-icon-button", () => ({}));
vi.mock("@ha/components/input/ha-input", async () => {
  const lit = await import("lit");
  return {
    HaInput: class extends lit.LitElement {
      static styles = [];
    },
  };
});

// The group address selectors consume HA's localize context.
const createHost = () => {
  const host = document.createElement("div");
  new ContextProvider(host, {
    context: internationalizationContext,
    initialValue: { localize: (key: string) => key } as any,
  });
  document.body.appendChild(host);
  return host;
};

const ga = (name: string, required = true): SelectorSchema => ({
  name,
  type: "knx_group_address",
  options: { write: { required: true }, state: { required: false }, passive: true },
  required,
});

// a cut-down light `color` group select, as the backend serializes it
const COLOR: GroupSelect = {
  name: "color",
  type: "knx_group_select",
  collapsible: true,
  schema: [
    {
      type: "knx_group_select_option",
      translation_key: "single_address",
      schema: [ga("ga_color")],
    },
    {
      type: "knx_group_select_option",
      translation_key: "individual_addresses",
      schema: [ga("ga_red_brightness"), ga("ga_green_brightness"), ga("ga_blue_brightness")],
    },
  ],
};

const SCHEMA: SelectorSchema[] = [
  { name: "knx", type: "knx_section", schema: [ga("ga_switch"), COLOR] } as SelectorSchema,
];

const createForm = (config: Record<string, unknown>) => {
  const form = new KnxForm();
  form.hass = { localize: (key: string) => key } as any;
  form.knx = { dptMetadata: {}, localize: (key: string) => key } as any;
  form.backendLocalize = (key: string) => key;
  form.schema = SCHEMA;
  form.config = config;
  return form;
};

describe("KnxForm group select", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the selected option of a configured group", () => {
    const form = createForm({
      knx: {
        color: {
          ga_red_brightness: { write: "1/2/1" },
          ga_green_brightness: { write: "1/2/2" },
          ga_blue_brightness: { write: "1/2/3" },
        },
      },
    });
    expect((form as any)._getOptionIndex(COLOR, "knx.color")).toBe(1);
  });

  it("falls back to the first option when the group is not in the config", () => {
    const form = createForm({ knx: { ga_switch: { write: "1/1/1" } } });
    expect((form as any)._getOptionIndex(COLOR, "knx.color")).toBe(0);
  });

  it("falls back to the first option when the backend stored the group as null", () => {
    // an optional group select left unset is stored as `null` since 2026.11
    const form = createForm({ knx: { ga_switch: { write: "1/1/1" }, color: null } });
    expect((form as any)._getOptionIndex(COLOR, "knx.color")).toBe(0);
    expect((form as any)._groupHasGroupAddressInConfig(COLOR, "knx.color")).toBe(false);
  });

  it("renders a light stored without color", async () => {
    const form = createForm({ knx: { ga_switch: { write: "1/1/1" }, color: null } });
    createHost().appendChild(form);
    await form.updateComplete;

    const select = form.shadowRoot!.querySelector("ha-control-select") as any;
    expect(select.value).toBe("0");
    expect(form.shadowRoot!.querySelectorAll("knx-group-address-selector")).toHaveLength(2);
  });
});
