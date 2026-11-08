import {
  mdiToggleSwitchVariant,
  mdiCheckCircle,
  mdiWindowShutter,
  mdiFan,
  mdiButtonPointer,
  mdiMessageAlert,
  mdiValve,
} from "@mdi/js";
import { FALLBACK_DOMAIN_ICONS } from "@ha/data/icons";
import { ctrlOrCmdLabel } from "@ha/common/keyboard/ctrl-or-cmd";
import type { LocalizeFunc } from "@ha/common/translations/localize";
import type { SupportedPlatform } from "../types/entity_data";

export interface PlatformStyle {
  iconPath: string;
  color: string;
}

export const platformConstants: Record<SupportedPlatform, Partial<PlatformStyle>> = {
  binary_sensor: {
    iconPath: mdiCheckCircle,
    color: "var(--green-color)",
  },
  button: {
    iconPath: mdiButtonPointer,
    color: "var(--purple-color)",
  },
  climate: {
    color: "var(--red-color)",
  },
  cover: {
    iconPath: mdiWindowShutter,
    color: "var(--cyan-color)",
  },
  date: {
    color: "var(--lime-color)",
  },
  event: {
    iconPath: mdiMessageAlert,
    color: "var(--deep-orange-color)",
  },
  fan: {
    iconPath: mdiFan,
    color: "var(--light-grey-color)",
  },
  light: {
    color: "var(--amber-color)",
  },
  notify: {
    color: "var(--pink-color)",
  },
  number: {
    color: "var(--teal-color)",
  },
  scene: {
    color: "var(--deep-purple-color)",
  },
  select: {
    color: "var(--indigo-color)",
  },
  sensor: {
    color: "var(--orange-color)",
  },
  switch: {
    iconPath: mdiToggleSwitchVariant,
    color: "var(--blue-color)",
  },
  text: {
    color: "var(--brown-color)",
  },
  time: {
    color: "var(--light-green-color)",
  },
  valve: {
    iconPath: mdiValve,
    color: "var(--light-blue-color)",
  },
  weather: {
    color: "var(--yellow-color)",
  },
};

export function getPlatformStyle(platform: SupportedPlatform): PlatformStyle {
  return {
    iconPath: FALLBACK_DOMAIN_ICONS[platform],
    color: "var(--dark-grey-color)",
    ...platformConstants[platform],
  };
}

/** The keys that switch an editor between its form and YAML, spelled like HA's shortcuts dialog. */
export const yamlModeShortcutHint = (localize: LocalizeFunc): string =>
  `${ctrlOrCmdLabel(localize)}+Shift+Y`;
