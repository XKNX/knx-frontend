import { afterEach, describe, expect, it, vi } from "vitest";

import { showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import { nextRender } from "@ha/common/util/render-status";
import type { KNX } from "../types/knx";

import { KNXCreateExpose } from "./expose_create";

vi.mock("@ha/dialogs/generic/show-dialog-box", () => ({ showConfirmationDialog: vi.fn() }));

// A disconnected editor: its render needs the entity and config load tasks, which the YAML mode
// toggle does not. Lit defers updates until first connected, so `updateComplete` stays
// pending and the editor focus after a switch is left to the real page.
const createEditor = () => {
  const editor = new KNXCreateExpose();
  editor.knx = { localize: (key: string) => key } as unknown as KNX;
  return editor;
};

const ctrlShift = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey: true, bubbles: true, ...init });

// the shortcut handler blurs the focused field and waits a render before toggling
const settled = async () => {
  await nextRender();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe("KNXCreateExpose YAML mode shortcut", () => {
  afterEach(() => {
    vi.mocked(showConfirmationDialog).mockReset();
  });

  it("binds Ctrl/Cmd+Shift+Y to the mode toggle", async () => {
    const editor = createEditor();
    const shortcuts = (editor as any).supportedShortcutsInInput();
    expect(Object.keys(shortcuts)).toEqual(["Y"]);

    shortcuts.Y();
    await settled();
    expect((editor as any)._mode).toBe("yaml");

    shortcuts.Y();
    await settled();
    expect((editor as any)._mode).toBe("gui");
  });

  it("toggles from a window keydown, also while an input is focused", async () => {
    const editor = createEditor();
    editor.addKeyboardShortcuts();
    try {
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      window.dispatchEvent(ctrlShift("Y"));
      await settled();
      expect((editor as any)._mode).toBe("yaml");
      // the pending input is blurred so its value is committed before the form goes away
      expect(document.activeElement).not.toBe(input);

      // without shift, or with alt, it is somebody else's shortcut
      window.dispatchEvent(ctrlShift("y", { shiftKey: false }));
      window.dispatchEvent(ctrlShift("Y", { altKey: true }));
      await settled();
      expect((editor as any)._mode).toBe("yaml");
      input.remove();
    } finally {
      editor.removeKeyboardShortcuts();
    }
  });

  it("keeps the YAML editor when discarding invalid YAML is declined", async () => {
    const editor = createEditor();
    (editor as any)._mode = "yaml";
    (editor as any)._yamlErrors = "bad indentation";
    vi.mocked(showConfirmationDialog).mockResolvedValue(false);

    (editor as any).supportedShortcutsInInput().Y();
    await settled();
    expect((editor as any)._mode).toBe("yaml");
    expect((editor as any)._yamlErrors).toBe("bad indentation");

    vi.mocked(showConfirmationDialog).mockResolvedValue(true);
    (editor as any).supportedShortcutsInInput().Y();
    await settled();
    expect((editor as any)._mode).toBe("gui");
    expect((editor as any)._yamlErrors).toBeUndefined();
  });
});
