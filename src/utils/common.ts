import { mdiToggleSwitchVariant, mdiCheckCircle, mdiWindowShutter } from "@mdi/js";
import { FALLBACK_DOMAIN_ICONS } from "@ha/data/icons";
import type { SupportedPlatform } from "../types/entity_data";

export const SUPPORTED_PLATFORMS = ["switch", "light", "binary_sensor", "cover"] as const;

export interface PlatformInfo {
  iconPath: string;
  color: string;
}

export const platformConstants: Record<SupportedPlatform, PlatformInfo> = {
  binary_sensor: {
    iconPath: mdiCheckCircle,
    color: "var(--green-color)",
  },
  switch: {
    iconPath: mdiToggleSwitchVariant,
    color: "var(--blue-color)",
  },
  light: {
    iconPath: FALLBACK_DOMAIN_ICONS.light,
    color: "var(--amber-color)",
  },
  cover: {
    iconPath: mdiWindowShutter,
    color: "var(--cyan-color)",
  },
};
