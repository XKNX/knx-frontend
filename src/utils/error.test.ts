import { describe, expect, it } from "vitest";

import { errorMessage } from "./error";

describe("errorMessage", () => {
  it.each([
    [
      "a Home Assistant API error",
      { code: "home_assistant_error", message: "Invalid password" },
      "Invalid password",
    ],
    ["an Error", new Error("Project file could not be read"), "Project file could not be read"],
    ["a plain string", "Plain failure", "Plain failure"],
  ])("returns the message of %s", (_, error, expected) => {
    expect(errorMessage(error)).toBe(expected);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty object", {}],
    ["an error code without message", { code: "unknown_error" }],
    ["an empty message", { message: "" }],
    ["a non-string message", { message: 42 }],
    ["an empty string", ""],
  ])("returns undefined for %s", (_, error) => {
    expect(errorMessage(error)).toBeUndefined();
  });
});
