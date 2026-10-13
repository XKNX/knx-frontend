import type { SelectorSchema } from "../../../src/types/schema";

export function createSchemas(): Record<string, SelectorSchema[]> {
  return {
    light: [
      {
        name: "ga_switch",
        type: "knx_group_address",
        required: true,
        options: {
          write: { required: true },
          state: { required: false },
          validDPTs: [{ main: 1, sub: 1 }],
        },
      },
    ],
    sensor: [
      {
        name: "ga_sensor",
        type: "knx_group_address",
        required: true,
        options: {
          state: { required: true },
          dptClasses: ["numeric", "string"],
        },
      },
    ],
  };
}
