import IntlMessageFormat from "intl-messageformat";
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

export function localize(hass: HomeAssistant, key: string, replace?: Record<string, any>): string {
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
    const hassTranslation = hass.localize(key, replace);
    if (hassTranslation) {
      return hassTranslation;
    }
    logger.error(`Translation problem with '${key}' for '${lang}'`);
    return key;
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
