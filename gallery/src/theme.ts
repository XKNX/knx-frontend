import { applyThemesOnElement } from "@ha/common/dom/apply_themes_on_element";
import type { HomeAssistant } from "@ha/types";
import type { GalleryTheme } from "./types";

export const knxTheme = {
  "primary-color": "#5e8a3a",
  "text-primary-color": "#ffffff",
  "accent-color": "#2a4691",
  "knx-green": "#5e8a3a",
  "knx-blue": "#2a4691",
};

export function applyGalleryTheme(host: HTMLElement, theme: GalleryTheme): void {
  const dark =
    theme.mode === "dark" ||
    (theme.mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const themes: HomeAssistant["themes"] = {
    default_theme: "default",
    default_dark_theme: null,
    darkMode: dark,
    theme: theme.theme,
    themes: { knx: knxTheme },
  };
  applyThemesOnElement(host, themes, theme.theme, { dark }, true);
  host.style.setProperty("--knx-green", knxTheme["knx-green"]);
  host.style.setProperty("--knx-blue", knxTheme["knx-blue"]);
  host.style.colorScheme = dark ? "dark" : "light";
}
