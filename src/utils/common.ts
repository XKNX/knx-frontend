import { mdiToggleSwitchVariant } from "@mdi/js";
// import { FIXED_DOMAIN_ICONS } from "@ha/common/const";
import { switchSchema, type SettingsGroup } from "./schema";

export type PlatformInfo = {
  name: string;
  iconPath: string;
  color: string;
  description?: string;
  schema: SettingsGroup[];
};

export const platformConstants: { [key: string]: PlatformInfo } = {
  switch: {
    name: "Switch",
    iconPath: mdiToggleSwitchVariant,
    color: "var(--blue-color)",
    description: "The KNX switch platform is used as an interface to switching actuators.",
    schema: switchSchema,
  },
  // light: {
  //   name: "Light",
  //   iconPath: FIXED_DOMAIN_ICONS.light,
  //   color: "var(--amber-color)",
  // },
};
