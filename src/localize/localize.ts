import IntlMessageFormat from "intl-messageformat";
import { HomeAssistant } from "@ha/types";
import * as en from "./languages/en.json";
import * as ca from "./languages/ca.json";
import * as cs from "./languages/cs.json";
import * as es from "./languages/es.json";
import * as et from "./languages/et.json";
import * as fr from "./languages/fr.json";
import * as it from "./languages/it.json";
import * as nl from "./languages/nl.json";
import * as sk from "./languages/sk.json";
import * as sv from "./languages/sv.json";
import * as de from "./languages/de.json";
import * as ru from "./languages/ru.json";

import { KNXLogger } from "../tools/knx-logger";

const languages = {
  ca,
  cs,
  en,
  et,
  es,
  fr,
  it,
  nl,
  sk,
  sv,
  de,
  ru,
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
    } catch (err: any) {
      logger.warn(`Translation problem with '${key}' for '${lang}'`);
      return key;
    }
    _localizationCache[messageKey] = translatedMessage;
  }

  try {
    return translatedMessage.format<string>(replace) as string;
  } catch (err: any) {
    logger.warn(`Translation problem with '${key}' for '${lang}'`);
    return key;
  }
}
