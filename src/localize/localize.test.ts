import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockHass } from "../../test/helpers/mock-hass";
import { KNXLogger } from "../tools/knx-logger";

import type { KnxLocalizeKey } from "./localize";
import { localize, localizeFormKey } from "./localize";

describe("localize", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves local keys from the bundled translations", () => {
    const hass = createMockHass({ language: "de" });

    expect(localize(hass, "status_try_again")).toBe("Erneut versuchen");
    expect(hass.localize).not.toHaveBeenCalled();
  });

  it.each([
    "component.knx.config_panel.info.title",
    "ui.common.name",
    "panel.notfound",
    "state.default.unknown",
  ])("passes %s directly to hass.localize", (key) => {
    const hass = createMockHass({ translations: { [key]: "Translated {value}" } });

    expect(localize(hass, key as KnxLocalizeKey, { value: "1" })).toBe("Translated 1");
    expect(hass.localize).toHaveBeenCalledWith(key, { value: "1" });
  });

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

  describe("localizeFormKey", () => {
    const FIELD = "component.knx.config_panel.entities.create._.knx.color_temp_min";

    it("returns an empty string without logging for a missing description", () => {
      const error = vi.spyOn(KNXLogger.prototype, "error").mockImplementation(() => undefined);

      expect(localizeFormKey(createMockHass(), `${FIELD}.description`)).toBe("");
      expect(error).not.toHaveBeenCalled();
    });

    it("resolves an existing description", () => {
      const hass = createMockHass({ translations: { [`${FIELD}.description`]: "Minimum" } });

      expect(localizeFormKey(hass, `${FIELD}.description`)).toBe("Minimum");
    });

    it("logs and returns the key for other missing form keys", () => {
      const error = vi.spyOn(KNXLogger.prototype, "error").mockImplementation(() => undefined);

      expect(localizeFormKey(createMockHass(), `${FIELD}.label`)).toBe(`${FIELD}.label`);
      expect(error).toHaveBeenCalledWith(expect.stringContaining(`${FIELD}.label`));
    });
  });
});
