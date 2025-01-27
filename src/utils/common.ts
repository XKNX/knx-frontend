import { mdiToggleSwitchVariant, mdiCheckCircle } from "@mdi/js";
import { FALLBACK_DOMAIN_ICONS } from "@ha/data/icons";
import * as schema from "./schema";
import type { SupportedPlatform } from "../types/entity_data";

export type PlatformInfo = {
  name: string;
  iconPath: string;
  color: string;
  description?: string;
  schema: schema.SettingsGroup[];
};

export const platformConstants: Record<SupportedPlatform, PlatformInfo> = {
  binary_sensor: {
    name: "Binary Sensor",
    iconPath: mdiCheckCircle,
    color: "var(--green-color)",
    description: "Read-only entity for binary datapoints. Window or door states etc.",
    schema: schema.binarySensorSchema,
  },
  switch: {
    name: "Switch",
    iconPath: mdiToggleSwitchVariant,
    color: "var(--blue-color)",
    description: "The KNX switch platform is used as an interface to switching actuators.",
    schema: schema.switchSchema,
  },
  light: {
    name: "Light",
    iconPath: FALLBACK_DOMAIN_ICONS.light,
    color: "var(--amber-color)",
    description:
      "The KNX light platform is used as an interface to dimming actuators, LED controllers, DALI gateways and similar.",
    schema: schema.lightSchema,
  },
};
