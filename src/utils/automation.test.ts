import { afterEach, describe, expect, it, vi } from "vitest";

import { KNXLogger } from "../tools/knx-logger";
import { buildAutomationFromKnx, openAutomationEditor } from "./automation";

afterEach(() => {
  delete (window.parent as { customPanel?: HTMLElement }).customPanel;
  vi.restoreAllMocks();
});

describe("buildAutomationFromKnx", () => {
  it("builds a current-schema KNX telegram trigger", () => {
    expect(
      buildAutomationFromKnx({
        destination: "1/2/3",
        destinationName: "Ceiling Light",
        group_value_read: false,
      }),
    ).toEqual({
      alias: "KNX: 1/2/3 Ceiling Light",
      description: "",
      mode: "single",
      triggers: [
        {
          trigger: "knx.telegram",
          options: {
            destination: ["1/2/3"],
            group_value_read: false,
          },
        },
      ],
      conditions: [],
      actions: [],
    });
  });

  it("uses only the destination when it has no name", () => {
    expect(buildAutomationFromKnx({ destination: "1/2/3" }).alias).toBe("KNX: 1/2/3");
  });
});

describe("openAutomationEditor", () => {
  it("dispatches the editor event on the parent custom panel", () => {
    const customPanel = document.createElement("div");
    const config = { alias: "Test" };
    let editorEvent: CustomEvent | undefined;
    customPanel.addEventListener("hass-automation-editor", (event) => {
      editorEvent = event as CustomEvent;
    });
    (window.parent as { customPanel?: HTMLElement }).customPanel = customPanel;

    openAutomationEditor(config, true);

    expect(editorEvent?.detail).toEqual({ data: config, expanded: true });
  });

  it("warns when the parent custom panel is unavailable", () => {
    const warnSpy = vi.spyOn(KNXLogger.prototype, "warn").mockImplementation(() => undefined);

    openAutomationEditor({ alias: "Test" });

    expect(warnSpy).toHaveBeenCalledWith(
      "Cannot open automation editor: parent custom panel not available",
    );
  });
});
