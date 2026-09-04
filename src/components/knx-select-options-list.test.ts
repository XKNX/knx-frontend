import { describe, it, expect, beforeEach } from "vitest";

import { KnxSelectOptionsList } from "./knx-select-options-list";
import type { ErrorDescription } from "../types/entity_data";

const error = (path: string[] | null, message: string): ErrorDescription => ({
  path,
  message,
  code: null,
});

describe("KnxSelectOptionsList", () => {
  let element: KnxSelectOptionsList;

  beforeEach(() => {
    element = new KnxSelectOptionsList();
    element.hass = { localize: (key: string) => key } as any;
    element.knx = { dptMetadata: {} } as any;
  });

  describe("_optionValidationErrors", () => {
    // options are validated as a list, so the backend indexes their errors by
    // position - e.g. `custom_options[1].option` arrives as path ["1", "option"]
    beforeEach(() => {
      element.validationErrors = [
        error(["1", "option"], "Option name is required"),
        error(["2", "value"], "Invalid payload"),
        error(["2"], "Each option must be a dictionary"),
        error([], "At least one option is required"),
      ];
    });

    it("routes the name error to the option it belongs to", () => {
      const { name } = (element as any)._optionValidationErrors(1);
      expect(name?.message).toBe("Option name is required");
    });

    it("does not leak an option's error to its siblings", () => {
      expect((element as any)._optionValidationErrors(0)).toEqual({
        name: undefined,
        payload: undefined,
      });
    });

    it("keeps the name error out of the payload subtree", () => {
      const { payload } = (element as any)._optionValidationErrors(1);
      expect(payload).toBeUndefined();
    });

    it("passes payload and option base errors to the payload selector", () => {
      const { name, payload } = (element as any)._optionValidationErrors(2);
      expect(name).toBeUndefined();
      expect(payload).toEqual([
        error(["value"], "Invalid payload"),
        error([], "Each option must be a dictionary"),
      ]);
    });

    it("leaves the list base error to the list itself", () => {
      // the base error has an empty path, so no index matches it
      for (const index of [0, 1, 2]) {
        const { name, payload } = (element as any)._optionValidationErrors(index);
        expect(name?.message).not.toBe("At least one option is required");
        expect(payload ?? []).not.toContainEqual(
          expect.objectContaining({ message: "At least one option is required" }),
        );
      }
    });

    it("returns nothing when there are no errors", () => {
      element.validationErrors = undefined;
      expect((element as any)._optionValidationErrors(0)).toEqual({
        name: undefined,
        payload: undefined,
      });
    });
  });
});
