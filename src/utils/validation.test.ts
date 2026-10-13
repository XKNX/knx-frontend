import { describe, expect, it, vi } from "vitest";

import type { ErrorDescription } from "../types/entity_data";
import { localizeValidationErrors } from "./validation";

const error = (overrides: Partial<ErrorDescription>): ErrorDescription => ({
  path: ["knx", "ga_switch"],
  message: "backend message",
  code: null,
  ...overrides,
});

describe("localizeValidationErrors", () => {
  it("replaces the message with the translation of its key", () => {
    const localize = vi.fn(() => "translated");
    const [result] = localizeValidationErrors(localize, [
      error({ translation_key: "invalid_group_address", placeholders: { value: "1/2/3/4" } }),
    ]);
    expect(localize).toHaveBeenCalledWith(
      "component.knx.config_panel.validation_error.invalid_group_address",
      { value: "1/2/3/4" },
    );
    expect(result).toEqual(
      error({
        message: "translated",
        translation_key: "invalid_group_address",
        placeholders: { value: "1/2/3/4" },
      }),
    );
  });

  it("joins list placeholders", () => {
    const localize = vi.fn(() => "translated");
    localizeValidationErrors(localize, [
      error({ translation_key: "value_one_of", placeholders: { values: ["text", "password"] } }),
    ]);
    expect(localize).toHaveBeenCalledWith(expect.any(String), { values: "text, password" });
  });

  it.each([
    ["without a translation key", error({}), () => "translated"],
    ["with a missing translation", error({ translation_key: "unknown" }), () => ""],
  ])("keeps the backend message %s", (_, input, localize) => {
    expect(localizeValidationErrors(localize, [input])).toEqual([input]);
  });
});
