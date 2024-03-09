import type { Selector } from "@ha/data/selector";
import { DPT } from "../types/websocket";

export type SettingsGroup = {
  type: "settings_group";
  heading: string;
  description: string;
  selectors: SelectorSchema[];
  advanced?: boolean;
};

export type SelectorSchema =
  | GASchema
  | GroupSelect
  | { name: "sync_state"; type: "sync_state" }
  | {
      name: string;
      type: "selector";
      default?: any;
      selector: Selector;
      label: string;
      helper?: string;
    };

type GASchema = {
  name: string;
  type: "group_address";
  label?: string;
  options: GASchemaOptions;
};

export type GASchemaOptions = {
  write?: { required: boolean };
  state?: { required: boolean };
  passive?: boolean;
  validDPTs?: DPT[]; // one of validDPts or dptSelect shall be set
  dptSelect?: DPTOption[];
};

export type DPTOption = {
  value: string;
  label: string;
  description?: string;
  dpt: DPT;
};

export type GroupSelect = {
  type: "group_select";
  name: string;
  options: {
    value: string;
    label: string;
    description?: string;
    schema: (SettingsGroup | SelectorSchema)[];
  }[];
};

export const switchSchema: SettingsGroup[] = [
  {
    type: "settings_group",
    heading: "Switching",
    description: "DPT 1 group addresses controlling the switch function.",
    selectors: [
      {
        name: "ga_switch",
        type: "group_address",
        options: {
          write: { required: true },
          state: { required: false },
          passive: true,
          validDPTs: [{ main: 1, sub: null }],
        },
      },
      {
        name: "invert",
        type: "selector",
        selector: { boolean: null },
        label: "Invert",
        helper: "Invert payloads before processing or sending.",
        // default: false, // does this work?
      },
      {
        name: "respond_to_read",
        type: "selector",
        selector: { boolean: null },
        label: "Respond to read",
        helper: "Respond to GroupValueRead telegrams received to the configured address.",
      },
    ],
  },
  {
    type: "settings_group",
    advanced: true,
    heading: "State updater",
    description: "Actively request state updates from KNX bus for state addresses.",
    selectors: [
      {
        name: "sync_state",
        type: "sync_state",
      },
    ],
  },
];
