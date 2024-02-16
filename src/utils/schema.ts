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
  | { name: string; type: "boolean"; label: string; helper?: string }
  | { name: "sync_state"; type: "sync_state" };

type GASchema = {
  name: string;
  type: "group_address";
  options: {
    write?: { required: boolean };
    state?: { required: boolean };
    passive?: boolean;
    validDPTs: DPT[];
  };
};

// export const switchSchema: SelectorSchema[] = [
//   {
//     name: "ga_switch",
//     type: "group_address",
//     options: {
//       write: { required: true },
//       state: { required: false },
//       passive: true,
//       validDPTs: [{ main: 1, sub: null }],
//     },
//   },
//   {
//     name: "invert",
//     type: "boolean",
//     // default: false, // does this work?
//   },
//   {
//     name: "respond_to_read",
//     type: "boolean",
//     // default: false, // does this work?
//   },
//   {
//     name: "sync_state",
//     type: "sync_state",
//   },
// ];

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
        type: "boolean",
        label: "Invert",
        helper: "Invert payloads before processing or sending.",
        // default: false, // does this work?
      },
      {
        name: "respond_to_read",
        type: "boolean",
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
