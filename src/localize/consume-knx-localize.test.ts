import { afterEach, describe, expect, it, vi } from "vitest";
import { LitElement } from "lit";

import { KNXLogger } from "../tools/knx-logger";

import { consumeKnxLocalize } from "./consume-knx-localize";
import type { KnxLocalizeFunc } from "./localize";

class TestElement extends LitElement {
  @consumeKnxLocalize()
  public localize?: KnxLocalizeFunc;
}
customElements.define("knx-test-consume-localize", TestElement);

declare global {
  interface HTMLElementTagNameMap {
    "knx-test-consume-localize": TestElement;
  }
}

const translations: Record<string, string> = { "ui.common.name": "Name" };
const haLocalize = vi.fn((key: string) => translations[key] ?? "");

const createElement = () => {
  const element = new TestElement();
  // The context delivers the internationalization object; the decorator wraps its `localize`.
  Reflect.set(element, "localize", { localize: haLocalize });
  return element;
};

describe("consumeKnxLocalize", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves keys through the context localize", () => {
    expect(createElement().localize!("ui.common.name")).toBe("Name");
  });

  it("logs and returns the key when a translation is missing", () => {
    const error = vi.spyOn(KNXLogger.prototype, "error").mockImplementation(() => undefined);

    expect(createElement().localize!("ui.common.missing")).toBe("ui.common.missing");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ui.common.missing"));
  });

  it("returns an empty string without logging for optional lookups", () => {
    const error = vi.spyOn(KNXLogger.prototype, "error").mockImplementation(() => undefined);

    expect(createElement().localize!.optional("component.knx.config_panel.dpt.options.1_001")).toBe(
      "",
    );
    expect(error).not.toHaveBeenCalled();
  });
});
