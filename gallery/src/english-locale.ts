// The offline gallery only ships English strings and locale data. Home Assistant falls back to
// the browser language in its demo translations, locale and Intl polyfills, which would replace
// the English backend strings and request missing locale data on non-English browsers.
// Import this module before any Home Assistant module.
Object.defineProperties(navigator, {
  language: { value: "en", configurable: true },
  languages: { value: Object.freeze(["en"]), configurable: true },
});
