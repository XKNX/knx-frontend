import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockHass } from "../../test/helpers/mock-hass";
import { KNXLogger } from "../tools/knx-logger";

import type { KnxLocalizeKey } from "./localize";
import { localize } from "./localize";

describe("localize", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves local keys from the bundled translations", () => {
    const hass = createMockHass({ language: "de" });

    expect(localize(hass, "status_try_again")).toBe("Erneut versuchen");
    expect(hass.localize).not.toHaveBeenCalled();
  });

  it.each(["component.knx.config_panel.info.title", "ui.common.name"])(
    "passes %s directly to hass.localize",
    (key) => {
      const hass = createMockHass({ translations: { [key]: "Translated {value}" } });

      expect(localize(hass, key as KnxLocalizeKey, { value: "1" })).toBe("Translated 1");
      expect(hass.localize).toHaveBeenCalledWith(key, { value: "1" });
    },
  );

  it.each(["component.knx.config_panel.missing", "ui.common.missing", "missing_local_key"])(
    "logs and returns the key %s when no translation exists",
    (key) => {
      const error = vi.spyOn(KNXLogger.prototype, "error").mockImplementation(() => undefined);
      const hass = createMockHass();

      // Cast: missing keys are deliberately not valid keys.
      expect(localize(hass, key as KnxLocalizeKey)).toBe(key);
      expect(error).toHaveBeenCalledWith(expect.stringContaining(key));
    },
  );
});
