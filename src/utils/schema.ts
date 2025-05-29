import type { Selector } from "@ha/data/selector";
import type { DPT } from "../types/websocket";

export interface SettingsGroup {
  type: "settings_group";
  heading: string;
  description?: string;
  selectors: SelectorSchema[];
  collapsible?: boolean;
}

export type SelectorSchema =
  | GASelector
  | GroupSelect
  | { name: "sync_state"; type: "sync_state" }
  | KnxHaSelector;

export interface GroupSelect {
  type: "group_select";
  name: string;
  options: {
    label: string;
    description?: string;
    schema: (SettingsGroup | SelectorSchema)[];
  }[];
}

export interface KnxHaSelector {
  name: string;
  type: "selector";
  default?: any;
  optional?: boolean; // for optional boolean selectors, there shall be no default value (can't get applied)
  selector: Selector;
  label: string;
  helper?: string;
}

export interface GASelector {
  name: string;
  type: "group_address";
  label?: string;
  options: GASelectorOptions;
}

export interface GASelectorOptions {
  write?: { required: boolean };
  state?: { required: boolean };
  passive?: boolean;
  validDPTs?: DPT[]; // one of validDPts or dptSelect shall be set
  dptSelect?: DPTOption[];
}

export interface DPTOption {
  value: string;
  label: string;
  description?: string;
  dpt: DPT;
}

export const binarySensorSchema: SettingsGroup[] = [
  {
    type: "settings_group",
    heading: "Binary sensor",
    description: "DPT 1 group addresses representing binary states.",
    selectors: [
      {
        name: "ga_sensor",
        type: "group_address",
        options: {
          state: { required: true },
          passive: true,
          validDPTs: [{ main: 1, sub: null }],
        },
      },
      {
        name: "invert",
        type: "selector",
        selector: { boolean: null },
        label: "Invert",
        helper: "Invert payload before processing.",
        optional: true,
        // default: false, // does this work? - no, it doesn't - isn't forwarded to data when loading
      },
    ],
  },
  {
    type: "settings_group",
    collapsible: true,
    heading: "State properties",
    description: "Properties of the binary sensor state.",
    selectors: [
      {
        name: "ignore_internal_state",
        type: "selector",
        selector: { boolean: null },
        label: "Force update",
        helper: "Write each update to the state machine, even if the data is the same.",
        optional: true,
      },
      {
        name: "context_timeout",
        type: "selector",
        selector: { number: { min: 0, max: 10, step: 0.05, unit_of_measurement: "s" } },
        label: "Context timeout",
        helper:
          "The time in seconds between multiple identical telegram payloads would count towards an internal counter. This can be used to automate on mulit-clicks of a button. `0` to disable this feature.",
        default: 0.8, // not forwarded to data when loading - fine when optional: true
        optional: true,
      },
      {
        name: "reset_after",
        type: "selector",
        selector: {
          number: { min: 0, max: 600, mode: "box", step: 0.1, unit_of_measurement: "s" },
        },
        label: "Reset after",
        helper: "Reset back to “off” state after specified seconds.",
        default: 1, // not forwarded to data when loading - fine when optional: true
        optional: true,
      },
    ],
  },
  {
    type: "settings_group",
    collapsible: true,
    heading: "State updater",
    selectors: [
      {
        name: "sync_state",
        type: "sync_state",
      },
    ],
  },
];

export const coverSchema: SettingsGroup[] = [
  {
    type: "settings_group",
    heading: "Up/Down control",
    description: "DPT 1 group addresses triggering full movement.",
    selectors: [
      {
        name: "ga_up_down",
        type: "group_address",
        options: {
          write: { required: false },
          passive: true,
          validDPTs: [{ main: 1, sub: null }],
        },
      },
      {
        name: "invert_updown",
        type: "selector",
        selector: { boolean: null },
        label: "Invert",
        helper:
          "Default is UP (0) to open a cover and DOWN (1) to close a cover. Enable this to invert the up/down commands from/to your KNX actuator.",
        optional: true,
      },
    ],
  },
  {
    type: "settings_group",
    heading: "Stop",
    description: "DPT 1 group addresses for stopping movement.",
    selectors: [
      {
        name: "ga_stop",
        type: "group_address",
        label: "Stop",
        options: {
          write: { required: false },
          passive: true,
          validDPTs: [{ main: 1, sub: null }],
        },
      },
      {
        name: "ga_step",
        type: "group_address",
        label: "Stepwise move",
        options: {
          write: { required: false },
          passive: true,
          validDPTs: [{ main: 1, sub: 7 }],
        },
      },
    ],
  },
  {
    type: "settings_group",
    collapsible: true,
    heading: "Position",
    description: "DPT 5 group addresses for cover position.",
    selectors: [
      {
        name: "ga_position_set",
        type: "group_address",
        label: "Set position",
        options: {
          write: { required: false },
          passive: true,
          validDPTs: [{ main: 5, sub: 1 }],
        },
      },
      {
        name: "ga_position_state",
        type: "group_address",
        label: "Current Position",
        options: {
          state: { required: false },
          passive: true,
          validDPTs: [{ main: 5, sub: 1 }],
        },
      },
      {
        name: "invert_position",
        type: "selector",
        selector: { boolean: null },
        label: "Invert",
        helper: "Invert payload before processing. Enable if KNX reports 0% as fully closed.",
        optional: true,
      },
    ],
  },
  {
    type: "settings_group",
    collapsible: true,
    heading: "Tilt",
    description: "DPT 5 group addresses for slat tilt angle.",
    selectors: [
      {
        name: "ga_angle",
        type: "group_address",
        label: "Tilt angle",
        options: {
          write: { required: false },
          state: { required: false },
          passive: true,
          validDPTs: [{ main: 5, sub: 1 }],
        },
      },
      {
        name: "invert_angle",
        type: "selector",
        selector: { boolean: null },
        label: "Invert",
        helper: "Invert payload before processing. Enable if KNX reports 0% as fully closed.",
        optional: true,
      },
    ],
  },
  {
    type: "settings_group",
    heading: "Travel time",
    description: "Used to calculate intermediate positions of the cover while traveling.",
    selectors: [
      {
        name: "travelling_time_down",
        type: "selector",
        selector: {
          number: { min: 0, max: 1000, mode: "box", step: 0.1, unit_of_measurement: "s" },
        },
        label: "Travel time down",
        helper: "Time the cover needs to fully close in seconds.",
        default: 25,
      },
      {
        name: "travelling_time_up",
        type: "selector",
        selector: {
          number: { min: 0, max: 1000, mode: "box", step: 0.1, unit_of_measurement: "s" },
        },
        label: "Travel time up",
        helper: "Time the cover needs to fully open in seconds.",
        default: 25,
      },
    ],
  },
  {
    type: "settings_group",
    collapsible: true,
    heading: "State updater",
    selectors: [
      {
        name: "sync_state",
        type: "sync_state",
      },
    ],
  },
];

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
        helper: "Respond to GroupValueRead telegrams received to the configured send address.",
      },
    ],
  },
  {
    type: "settings_group",
    collapsible: true,
    heading: "State updater",
    selectors: [
      {
        name: "sync_state",
        type: "sync_state",
      },
    ],
  },
];

export const lightSchema: SettingsGroup[] = [
  {
    type: "settings_group",
    heading: "Switching",
    description: "DPT 1 group addresses turning the light on or off.",
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
    ],
  },
  {
    type: "settings_group",
    heading: "Brightness",
    description: "DPT 5 group addresses controlling the brightness.",
    selectors: [
      {
        name: "ga_brightness",
        type: "group_address",
        options: {
          write: { required: false },
          state: { required: false },
          passive: true,
          validDPTs: [{ main: 5, sub: 1 }],
        },
      },
    ],
  },
  {
    type: "settings_group",
    heading: "Color temperature",
    description: "Control the lights color temperature.",
    collapsible: true,
    selectors: [
      {
        name: "ga_color_temp",
        type: "group_address",
        options: {
          write: { required: false },
          state: { required: false },
          passive: true,
          dptSelect: [
            {
              value: "5.001",
              label: "Percent",
              description: "DPT 5.001",
              dpt: { main: 5, sub: 1 },
            },
            {
              value: "7.600",
              label: "Kelvin",
              description: "DPT 7.600",
              dpt: { main: 7, sub: 600 },
            },
            {
              value: "9",
              label: "2-byte float",
              description: "DPT 9",
              dpt: { main: 9, sub: null },
            },
          ],
        },
      },
      {
        name: "color_temp_min",
        type: "selector",
        label: "Warmest possible color temperature",
        default: 2700,
        selector: {
          number: {
            // color_temp selector doesn't provide a direct input box, only a slider
            min: 1000,
            max: 9000,
            step: 1,
            unit_of_measurement: "Kelvin",
          },
        },
      },
      {
        name: "color_temp_max",
        type: "selector",
        label: "Coldest possible color temperature",
        default: 6000,
        selector: {
          number: {
            min: 1000,
            max: 9000,
            step: 1,
            unit_of_measurement: "Kelvin",
          },
        },
      },
    ],
  },
  {
    type: "settings_group",
    heading: "Color",
    description: "Control the light color.",
    collapsible: true,
    selectors: [
      {
        type: "group_select",
        name: "color",
        options: [
          {
            label: "Single address",
            description: "RGB, RGBW or XYY color controlled by a single group address",
            schema: [
              {
                name: "ga_color",
                type: "group_address",
                options: {
                  write: { required: true },
                  state: { required: false },
                  passive: true,
                  dptSelect: [
                    {
                      value: "232.600",
                      label: "RGB",
                      description: "DPT 232.600",
                      dpt: { main: 232, sub: 600 },
                    },
                    {
                      value: "251.600",
                      label: "RGBW",
                      description: "DPT 251.600",
                      dpt: { main: 251, sub: 600 },
                    },
                    {
                      value: "242.600",
                      label: "XYY",
                      description: "DPT 242.600",
                      dpt: { main: 242, sub: 600 },
                    },
                  ],
                },
              },
            ],
          },
          {
            label: "Individual addresses",
            description: "RGB(W) using individual state and brightness group addresses",
            schema: [
              {
                type: "settings_group",
                heading: "Red",
                description: "Control the lights red color. Brightness group address is required.",
                selectors: [
                  {
                    name: "ga_red_switch",
                    type: "group_address",
                    label: "Switch",
                    options: {
                      write: { required: false },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 1, sub: null }],
                    },
                  },
                  {
                    name: "ga_red_brightness",
                    type: "group_address",
                    label: "Brightness",
                    options: {
                      write: { required: true },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 5, sub: 1 }],
                    },
                  },
                ],
              },
              {
                type: "settings_group",
                heading: "Green",
                description:
                  "Control the lights green color. Brightness group address is required.",
                selectors: [
                  {
                    name: "ga_green_switch",
                    type: "group_address",
                    label: "Switch",
                    options: {
                      write: { required: false },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 1, sub: null }],
                    },
                  },
                  {
                    name: "ga_green_brightness",
                    type: "group_address",
                    label: "Brightness",
                    options: {
                      write: { required: true },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 5, sub: 1 }],
                    },
                  },
                ],
              },
              {
                type: "settings_group",
                heading: "Blue",
                description: "Control the lights blue color. Brightness group address is required.",
                selectors: [
                  {
                    name: "ga_blue_switch",
                    type: "group_address",
                    label: "Switch",
                    options: {
                      write: { required: false },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 1, sub: null }],
                    },
                  },
                  {
                    name: "ga_blue_brightness",
                    type: "group_address",
                    label: "Brightness",
                    options: {
                      write: { required: true },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 5, sub: 1 }],
                    },
                  },
                ],
              },
              {
                type: "settings_group",
                heading: "White",
                description:
                  "Control the lights white color. Brightness group address is required.",
                selectors: [
                  {
                    name: "ga_white_switch",
                    type: "group_address",
                    label: "Switch",
                    options: {
                      write: { required: false },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 1, sub: null }],
                    },
                  },
                  {
                    name: "ga_white_brightness",
                    type: "group_address",
                    label: "Brightness",
                    options: {
                      write: { required: false },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 5, sub: 1 }],
                    },
                  },
                ],
              },
            ],
          },
          {
            label: "HSV",
            description: "Hue, saturation and brightness using individual group addresses",
            schema: [
              {
                type: "settings_group",
                heading: "Hue",
                description: "Control the lights hue.",
                selectors: [
                  {
                    name: "ga_hue",
                    type: "group_address",
                    options: {
                      write: { required: true },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 5, sub: 1 }],
                    },
                  },
                ],
              },
              {
                type: "settings_group",
                heading: "Saturation",
                description: "Control the lights saturation.",
                selectors: [
                  {
                    name: "ga_saturation",
                    type: "group_address",
                    options: {
                      write: { required: true },
                      state: { required: false },
                      passive: true,
                      validDPTs: [{ main: 5, sub: 1 }],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "settings_group",
    collapsible: true,
    heading: "State updater",
    selectors: [
      {
        name: "sync_state",
        type: "sync_state",
      },
    ],
  },
];
