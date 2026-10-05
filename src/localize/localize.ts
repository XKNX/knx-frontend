import { IntlMessageFormat } from "intl-messageformat";
import type { LocalizeFunc, LocalizeKeys } from "@ha/common/translations/localize";
import type { HomeAssistant } from "@ha/types";
import * as de from "./languages/de.json";
import * as en from "./languages/en.json";

import { KNXLogger } from "../tools/knx-logger";

const languages = {
  de,
  en,
};
const DEFAULT_LANGUAGE = "en";
const logger = new KNXLogger("localize");
const warnings: { language: string[]; sting: Record<string, string[]> } = {
  language: [],
  sting: {},
};

const _localizationCache = {};

/** Keys defined in the panel's own translation files. */
export type LocalKnxKey = keyof typeof en;

/** Keys accepted by `knx.localize`: Core and HA frontend keys, or local panel keys. */
export type KnxLocalizeKey = LocalizeKeys | LocalKnxKey;

/** HA `localize` that reports missing keys, with `optional` for lookups that may miss. */
export type KnxLocalizeFunc = LocalizeFunc & {
  /** Plain HA lookup: returns an empty string for missing keys, without logging. */
  optional: LocalizeFunc;
};

// Keys provided by Core (backend translations) or the HA frontend; never defined locally.
const HASS_KEY_PREFIXES = ["component.", "ui."];

const reportMissingKey = (key: string, language?: string): string => {
  logger.error(`Translation problem with '${key}'${language ? ` for '${language}'` : ""}`);
  return key;
};

/**
 * Wraps HA's `localize` so that missing keys are logged and rendered as the key
 * instead of silently returning an empty string.
 */
export const withMissingKeyReporting = (haLocalize: LocalizeFunc): KnxLocalizeFunc =>
  Object.assign(
    ((key, values) => haLocalize(key, values) || reportMissingKey(key)) as LocalizeFunc,
    { optional: haLocalize },
  );

export function localize(
  hass: HomeAssistant,
  key: KnxLocalizeKey,
  replace?: Record<string, any>,
): string {
  if (HASS_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return hass.localize(key as LocalizeKeys, replace) || reportMissingKey(key, hass.language);
  }

  let lang = (hass.language || localStorage.getItem("selectedLanguage") || DEFAULT_LANGUAGE)
    .replace(/['"]+/g, "")
    .replace("-", "_");

  if (!languages[lang]) {
    if (!warnings.language?.includes(lang)) {
      warnings.language.push(lang);
    }
    lang = DEFAULT_LANGUAGE;
  }

  const translatedValue = languages[lang]?.[key] || languages[DEFAULT_LANGUAGE][key];

  if (!translatedValue) {
    return hass.localize(key as LocalizeKeys, replace) || reportMissingKey(key, lang);
  }

  const messageKey = key + translatedValue;

  let translatedMessage = _localizationCache[messageKey] as IntlMessageFormat | undefined;

  if (!translatedMessage) {
    try {
      translatedMessage = new IntlMessageFormat(translatedValue, lang);
    } catch (_err: any) {
      logger.warn(`Translation problem with '${key}' for '${lang}'`);
      return key;
    }
    _localizationCache[messageKey] = translatedMessage;
  }

  try {
    return translatedMessage.format<string>(replace) as string;
  } catch (_err: any) {
    logger.warn(`Translation problem with '${key}' for '${lang}'`);
    return key;
  }
}
