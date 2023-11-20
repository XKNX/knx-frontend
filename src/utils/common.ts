import { mdiToggleSwitchVariant } from "@mdi/js";
import { FIXED_DOMAIN_ICONS } from "@ha/common/const";

export const platformConstants = {
  switch: {
    name: "Switch",
    iconPath: mdiToggleSwitchVariant,
    color: "var(--blue-color)",
  },
  light: {
    name: "Light",
    iconPath: FIXED_DOMAIN_ICONS.light,
    color: "var(--amber-color)",
  },
};
