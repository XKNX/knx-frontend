import type { Selector } from "@ha/data/selector";
import type { DPT } from "../types/websocket";

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
    selectors: [
      {
        type: "group_select",
        name: "_light_color_mode_schema",
        options: [
          {
            label: "Single address",
            description: "RGB, RGBW or XYY color controlled by a single group address",
            value: "default",
            schema: [
              {
                name: "ga_color",
                type: "group_address",
                options: {
                  write: { required: false },
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
            value: "individual",
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
            value: "hsv",
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
