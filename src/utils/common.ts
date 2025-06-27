import { mdiToggleSwitchVariant, mdiCheckCircle, mdiWindowShutter } from "@mdi/js";
import { FALLBACK_DOMAIN_ICONS } from "@ha/data/icons";
import * as schema from "./schema";
import type { SupportedPlatform } from "../types/entity_data";

export const SUPPORTED_PLATFORMS = ["switch", "light", "binary_sensor", "cover"] as const;

export interface PlatformInfo {
  name: string;
  iconPath: string;
  color: string;
  description?: string; // TODO: remove hardcoded description
  schema: schema.Section[]; // TODO: remove hardcoded schema
}

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
    iconPath: FALLBACK_DOMAIN_ICONS.light,
    color: "var(--amber-color)",
  },
  cover: {
    name: "Cover",
    iconPath: mdiWindowShutter,
    color: "var(--cyan-color)",
    description: "The KNX cover platform is used as an interface to shutter actuators.",
    schema: schema.coverSchema,
  },
};
