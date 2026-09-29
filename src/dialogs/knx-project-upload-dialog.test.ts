import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nothing, render } from "lit";

import type { HaExpansionPanel } from "@ha/components/ha-expansion-panel";
import { uploadFile } from "@ha/data/file_upload";
import { showAlertDialog } from "@ha/dialogs/generic/show-dialog-box";
import { createMockHass } from "../../test/helpers/mock-hass";
import { localize } from "../localize/localize";
import { processProjectFile } from "../services/websocket.service";
import type { KNX } from "../types/knx";
import type { KNXProjectInfo } from "../types/websocket";

import { KnxProjectUploadDialog } from "./knx-project-upload-dialog";
import {
  loadKnxProjectUploadDialog,
  showKnxProjectUploadDialog,
} from "./show-knx-project-upload-dialog";

vi.mock("@ha/data/file_upload", () => ({ uploadFile: vi.fn() }));
vi.mock("@ha/dialogs/generic/show-dialog-box", () => ({ showAlertDialog: vi.fn() }));
vi.mock("../services/websocket.service", () => ({ processProjectFile: vi.fn() }));

const PROJECT_INFO: KNXProjectInfo = {
  name: "Einfamilienhaus Musterstraße 12",
  last_modified: "2026-09-14T18:42:12.4132414Z",
  tool_version: "6.1.5686.0",
  xknxproject_version: "3.9.0",
};

const UPLOAD_FAILED = { "ui.components.selectors.file.upload_failed": "Upload fehlgeschlagen" };

const CORE_PREFIX = "component.knx.config_panel.dialogs.project_upload.current_project";

const createHass = (translations: Record<string, string> = {}) => createMockHass({ translations });

const createDialog = (
  projectInfo: KNXProjectInfo | null = PROJECT_INFO,
  backendTranslations: Record<string, string> = {},
) => {
  const hass = createHass(backendTranslations);
  const knx = {
    localize: (key: string, replace?: Record<string, any>) => localize(hass, key, replace),
    projectInfo,
  } as unknown as KNX;
  const dialog = new KnxProjectUploadDialog();
  dialog.params = { hass, knx };
  dialog.hass = hass;
  const container = document.createElement("div");
  const rerender = () => {
    render((dialog as any).render(), container, { host: dialog });
    return container;
  };
  rerender();
  return { dialog, hass, container, rerender };
};

type Rendered = ReturnType<typeof createDialog>;

const PROJECT_FILE = new File(["<knx/>"], "house.knxproj");

const fileUpload = (container: HTMLElement) =>
  container.querySelector("ha-file-upload") as HTMLElement & {
    uploading: boolean;
    disabled: boolean;
  };

const closeButton = (container: HTMLElement) =>
  container.querySelector('ha-icon-button[slot="headerNavigationIcon"]') as HTMLElement & {
    disabled: boolean;
  };

const passwordField = (container: HTMLElement) =>
  container.querySelector("ha-selector-text") as HTMLElement & { disabled: boolean };

const primaryButton = (container: HTMLElement) =>
  container.querySelector('ha-button[slot="primaryAction"]') as HTMLElement & {
    disabled: boolean;
  };

const secondaryButton = (container: HTMLElement) =>
  container.querySelector('ha-button[slot="secondaryAction"]') as HTMLElement & {
    disabled: boolean;
  };

const flushPromises = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve);
  });

// ha-button.click() forwards to an inner button that is not rendered while detached.
const click = (element: HTMLElement) =>
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

const pickFile = ({ container, rerender }: Rendered, file: File = PROJECT_FILE) => {
  fileUpload(container).dispatchEvent(
    new CustomEvent("file-picked", { detail: { files: [file] } }),
  );
  rerender();
};

const enterPassword = ({ container, rerender }: Rendered, value: string) => {
  container
    .querySelector("ha-selector-text")!
    .dispatchEvent(new CustomEvent("value-changed", { detail: { value } }));
  rerender();
};

const submit = async ({ container }: Rendered) => {
  click(primaryButton(container));
  // Let the awaited upload and processing promises settle.
  await vi.waitFor(() => expect(vi.mocked(uploadFile).mock.calls.length).toBeGreaterThan(0));
  await flushPromises();
};

const valueRows = (container: HTMLElement) =>
  Object.fromEntries(
    [...container.querySelectorAll("ha-list-item-value")].map((row) => [
      (row as HTMLElement & { label?: string }).label,
      row.textContent?.trim(),
    ]),
  );

beforeEach(() => {
  vi.mocked(uploadFile).mockReset();
  vi.mocked(processProjectFile).mockReset();
  vi.mocked(showAlertDialog).mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("KnxProjectUploadDialog", () => {
  describe("rendering", () => {
    it("renders nothing without params", () => {
      const dialog = new KnxProjectUploadDialog();

      expect((dialog as any).render()).toBe(nothing);
    });

    it("takes hass from the params when connected", () => {
      const hass = createHass();
      const dialog = new KnxProjectUploadDialog();
      dialog.params = { hass, knx: { projectInfo: null } as unknown as KNX };
      // Only the connect hook is under test; jsdom lacks the form APIs the HA inputs need.
      vi.spyOn(dialog as any, "render").mockReturnValue(nothing);

      document.body.appendChild(dialog);

      expect(dialog.hass).toBe(hass);
    });

    it("keeps hass unset when connected without params", () => {
      const dialog = new KnxProjectUploadDialog();

      document.body.appendChild(dialog);

      expect(dialog.hass).toBeUndefined();
    });

    it("uses the backend translations for title, description and upload label", () => {
      const { container } = createDialog(null, {
        "component.knx.config_panel.dialogs.project_upload.title": "Import ETS project",
        "component.knx.config_panel.dialogs.project_upload.description": "Description text",
        "component.knx.config_panel.dialogs.project_upload.file_upload_label": "ETS project file",
      });

      expect((container.querySelector("ha-dialog") as any).headerTitle).toBe("Import ETS project");
      expect((container.querySelector("ha-markdown") as any).content).toBe("Description text");
      expect((fileUpload(container) as any).label).toBe("ETS project file");
      expect(fileUpload(container).getAttribute("accept")).toBe(".knxproj, .knxprojarchive");
    });

    it("starts with an empty password field and a disabled submit button", () => {
      const { container } = createDialog();

      expect((container.querySelector("ha-selector-text") as any).value).toBe("");
      expect(primaryButton(container).disabled).toBe(true);
      expect(secondaryButton(container).disabled).toBe(false);
    });
  });

  describe("currently loaded project", () => {
    it("summarizes the loaded project in a collapsed panel", () => {
      const { container } = createDialog();

      expect(container.textContent).toContain("Currently loaded");
      const panel = container.querySelector<HaExpansionPanel>("ha-expansion-panel")!;
      expect(panel).not.toBeNull();
      expect(panel.expanded).toBe(false);
      expect(panel.header).toBe("Einfamilienhaus Musterstraße 12");
      expect(panel.secondary).toMatch(/^ETS 6\.1 · Modified .+/);

      const rows = valueRows(container);
      expect(rows["Last modified"]).toMatch(/2026/);
      expect(rows["ETS version"]).toBe("6.1.5686.0");
      expect(rows["Imported with"]).toBe("xknxproject 3.9.0");
    });

    it("does not recompute the summary on unrelated re-renders", () => {
      const rendered = createDialog();
      const summaryLookups = () =>
        vi
          .mocked(rendered.hass.localize)
          .mock.calls.filter(([key]) => String(key).startsWith(CORE_PREFIX)).length;
      const lookupsAfterFirstRender = summaryLookups();

      enterPassword(rendered, "secret");

      expect(lookupsAfterFirstRender).toBeGreaterThan(0);
      expect(summaryLookups()).toBe(lookupsAfterFirstRender);
    });

    it("updates the summary when translations change", () => {
      const rendered = createDialog();
      rendered.dialog.hass = createHass({ [`${CORE_PREFIX}.title`]: "Aktuell geladen" });

      rendered.rerender();

      expect(rendered.container.textContent).toContain("Aktuell geladen");
    });

    it("keeps the dialog unchanged when no project is loaded", () => {
      const { container } = createDialog(null);

      expect(container.querySelector("ha-expansion-panel")).toBeNull();
      expect(container.textContent).not.toContain("Currently loaded");
      expect(fileUpload(container)).not.toBeNull();
    });

    it("prefers Core translations over the local fallback", () => {
      const { container } = createDialog(PROJECT_INFO, {
        [`${CORE_PREFIX}.title`]: "Aktuell geladen",
        [`${CORE_PREFIX}.short_ets_version`]: "ETS {version}",
        [`${CORE_PREFIX}.modified`]: "Geändert {relative_time}",
        [`${CORE_PREFIX}.last_modified.label`]: "Zuletzt geändert",
        [`${CORE_PREFIX}.ets_version.label`]: "ETS-Version",
        [`${CORE_PREFIX}.imported_with.label`]: "Importiert mit",
      });

      expect(container.textContent).toContain("Aktuell geladen");
      const panel = container.querySelector<HaExpansionPanel>("ha-expansion-panel")!;
      expect(panel.secondary).toMatch(/^ETS 6\.1 · Geändert .+/);
      expect(Object.keys(valueRows(container))).toEqual([
        "Zuletzt geändert",
        "ETS-Version",
        "Importiert mit",
      ]);
    });

    it("omits missing modification date and ETS version", () => {
      const { container } = createDialog({
        ...PROJECT_INFO,
        last_modified: null,
        tool_version: "",
      });

      const panel = container.querySelector<HaExpansionPanel>("ha-expansion-panel")!;
      expect(panel.header).toBe("Einfamilienhaus Musterstraße 12");
      expect(panel.secondary).toBe("");
      expect(Object.keys(valueRows(container))).toEqual(["Imported with"]);
      expect(container.textContent).not.toContain("Invalid");
    });

    it("omits a modification date that cannot be parsed", () => {
      const { container } = createDialog({ ...PROJECT_INFO, last_modified: "not a date" });

      const panel = container.querySelector<HaExpansionPanel>("ha-expansion-panel")!;
      expect(panel.secondary).toBe("ETS 6.1");
      expect(Object.keys(valueRows(container))).toEqual(["ETS version", "Imported with"]);
      expect(container.textContent).not.toContain("Invalid");
    });

    it.each([
      ["6.1.5686.0", "ETS 6.1"],
      ["5.7", "ETS 5.7"],
      ["6", "ETS 6"],
      // ETS 4 projects report a descriptive tool version.
      ["ETS 4.2.0 (Build 3884)", "ETS 4.2.0 (Build 3884)"],
    ])("summarizes the ETS version %s as %s", (toolVersion, expected) => {
      const { container } = createDialog({
        ...PROJECT_INFO,
        last_modified: "",
        tool_version: toolVersion,
      });

      const panel = container.querySelector<HaExpansionPanel>("ha-expansion-panel")!;
      expect(panel.secondary).toBe(expected);
      expect(valueRows(container)["ETS version"]).toBe(toolVersion);
    });
  });

  describe("file selection", () => {
    it("enables submitting once a file is picked", () => {
      const rendered = createDialog();

      pickFile(rendered);

      expect((fileUpload(rendered.container) as any).value).toBe("house.knxproj");
      expect(primaryButton(rendered.container).disabled).toBe(false);
    });

    it("disables submitting again when the file is cleared", () => {
      const rendered = createDialog();
      pickFile(rendered);

      // Home Assistant's fireEvent sends an empty detail object for files-cleared.
      fileUpload(rendered.container).dispatchEvent(
        new CustomEvent("files-cleared", { detail: {} }),
      );
      rendered.rerender();

      expect((fileUpload(rendered.container) as any).value).toBeUndefined();
      expect(primaryButton(rendered.container).disabled).toBe(true);
    });

    it("reflects the entered password", () => {
      const rendered = createDialog();

      enterPassword(rendered, "secret");

      expect((rendered.container.querySelector("ha-selector-text") as any).value).toBe("secret");
    });
  });

  describe("upload", () => {
    it("does not upload anything without a file", async () => {
      const { container } = createDialog();

      click(primaryButton(container));
      await flushPromises();

      expect(uploadFile).not.toHaveBeenCalled();
      expect(processProjectFile).not.toHaveBeenCalled();
    });

    it("uploads and processes the file with the password, then closes and reloads", async () => {
      vi.mocked(uploadFile).mockResolvedValue("file-id");
      vi.mocked(processProjectFile).mockResolvedValue(undefined);
      const rendered = createDialog();
      const closeDialog = vi.spyOn(rendered.dialog, "closeDialog");
      const reload = vi.fn();
      rendered.dialog.addEventListener("knx-reload", reload);
      pickFile(rendered);
      enterPassword(rendered, "secret");

      await submit(rendered);

      expect(uploadFile).toHaveBeenCalledWith(rendered.hass, PROJECT_FILE);
      expect(processProjectFile).toHaveBeenCalledWith(rendered.hass, "file-id", "secret");
      expect(showAlertDialog).not.toHaveBeenCalled();
      expect(closeDialog).toHaveBeenCalledOnce();
      expect(reload).toHaveBeenCalledOnce();
    });

    it("sends an empty password when none was entered", async () => {
      vi.mocked(uploadFile).mockResolvedValue("file-id");
      vi.mocked(processProjectFile).mockResolvedValue(undefined);
      const rendered = createDialog();
      pickFile(rendered);

      await submit(rendered);

      expect(processProjectFile).toHaveBeenCalledWith(rendered.hass, "file-id", "");
    });

    it("sends an empty password after the field was cleared", async () => {
      vi.mocked(uploadFile).mockResolvedValue("file-id");
      vi.mocked(processProjectFile).mockResolvedValue(undefined);
      const rendered = createDialog();
      pickFile(rendered);
      enterPassword(rendered, "secret");
      enterPassword(rendered, "");

      await submit(rendered);

      expect(processProjectFile).toHaveBeenCalledWith(rendered.hass, "file-id", "");
    });

    it("locks the dialog while uploading and unlocks it afterwards", async () => {
      let finishProcessing!: () => void;
      vi.mocked(uploadFile).mockResolvedValue("file-id");
      vi.mocked(processProjectFile).mockReturnValue(
        new Promise<void>((resolve) => {
          finishProcessing = resolve;
        }),
      );
      const rendered = createDialog();
      vi.spyOn(rendered.dialog, "closeDialog");
      pickFile(rendered);

      click(primaryButton(rendered.container));
      await vi.waitFor(() => expect(processProjectFile).toHaveBeenCalled());
      rendered.rerender();

      expect(fileUpload(rendered.container).uploading).toBe(true);
      expect(fileUpload(rendered.container).disabled).toBe(true);
      expect(passwordField(rendered.container).disabled).toBe(true);
      expect(closeButton(rendered.container).disabled).toBe(true);
      expect(primaryButton(rendered.container).disabled).toBe(true);
      expect(secondaryButton(rendered.container).disabled).toBe(true);
      expect(
        rendered.container.querySelector("ha-dialog")!.hasAttribute("prevent-scrim-close"),
      ).toBe(true);

      finishProcessing();
      await flushPromises();
      rendered.rerender();

      expect(fileUpload(rendered.container).uploading).toBe(false);
      expect(fileUpload(rendered.container).disabled).toBe(false);
      expect(passwordField(rendered.container).disabled).toBe(false);
      expect(closeButton(rendered.container).disabled).toBe(false);
      expect(secondaryButton(rendered.container).disabled).toBe(false);
      expect(
        rendered.container.querySelector("ha-dialog")!.hasAttribute("prevent-scrim-close"),
      ).toBe(false);
    });

    it("refuses to close while uploading, e.g. on browser back navigation", async () => {
      let finishProcessing!: () => void;
      vi.mocked(uploadFile).mockResolvedValue("file-id");
      vi.mocked(processProjectFile).mockReturnValue(
        new Promise<void>((resolve) => {
          finishProcessing = resolve;
        }),
      );
      const rendered = createDialog();
      pickFile(rendered);

      click(primaryButton(rendered.container));
      await vi.waitFor(() => expect(processProjectFile).toHaveBeenCalled());

      // The dialog manager keeps a dialog open when closeDialog() returns false.
      expect(rendered.dialog.closeDialog()).toBe(false);

      finishProcessing();
      await flushPromises();

      expect(rendered.dialog.closeDialog()).not.toBe(false);
    });

    it("processes the submitted password even if the field changes during the upload", async () => {
      let finishUpload!: (fileId: string) => void;
      vi.mocked(uploadFile).mockReturnValue(
        new Promise<string>((resolve) => {
          finishUpload = resolve;
        }),
      );
      vi.mocked(processProjectFile).mockResolvedValue(undefined);
      const rendered = createDialog();
      vi.spyOn(rendered.dialog, "closeDialog");
      pickFile(rendered);
      enterPassword(rendered, "submitted");

      click(primaryButton(rendered.container));
      await vi.waitFor(() => expect(uploadFile).toHaveBeenCalled());
      enterPassword(rendered, "changed");
      finishUpload("file-id");
      await flushPromises();

      expect(processProjectFile).toHaveBeenCalledWith(rendered.hass, "file-id", "submitted");
    });

    it.each([
      [
        "a Home Assistant API error",
        { code: "home_assistant_error", message: "Invalid password" },
        "Invalid password",
      ],
      ["an Error", new Error("Project file could not be read"), "Project file could not be read"],
      ["a plain string", "Plain failure", "Plain failure"],
    ])("shows the processing error for %s and keeps the dialog open", async (_, error, text) => {
      vi.mocked(uploadFile).mockResolvedValue("file-id");
      vi.mocked(processProjectFile).mockRejectedValue(error);
      const rendered = createDialog(PROJECT_INFO, UPLOAD_FAILED);
      const closeDialog = vi.spyOn(rendered.dialog, "closeDialog");
      const reload = vi.fn();
      rendered.dialog.addEventListener("knx-reload", reload);
      pickFile(rendered);

      await submit(rendered);
      rendered.rerender();

      expect(showAlertDialog).toHaveBeenCalledWith(rendered.dialog, {
        title: "Upload fehlgeschlagen",
        text,
      });
      expect(closeDialog).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(fileUpload(rendered.container).uploading).toBe(false);
      // The picked file stays selected so the user can correct the password and retry.
      expect(primaryButton(rendered.container).disabled).toBe(false);
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["an object without message", {}],
      ["an error code without message", { code: "unknown_error" }],
      ["a lost connection (ERR_CONNECTION_LOST)", 3],
    ])("reports a rejection with %s as unknown error", async (_, error) => {
      vi.mocked(uploadFile).mockResolvedValue("file-id");
      vi.mocked(processProjectFile).mockRejectedValue(error);
      const rendered = createDialog(PROJECT_INFO, {
        ...UPLOAD_FAILED,
        "ui.common.unknown_error": "Unbekannter Fehler",
      });
      const closeDialog = vi.spyOn(rendered.dialog, "closeDialog");
      const reload = vi.fn();
      rendered.dialog.addEventListener("knx-reload", reload);
      pickFile(rendered);

      await submit(rendered);

      expect(showAlertDialog).toHaveBeenCalledWith(rendered.dialog, {
        title: "Upload fehlgeschlagen",
        text: "Unbekannter Fehler",
      });
      expect(closeDialog).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it("shows the upload error and skips processing when the file upload fails", async () => {
      vi.mocked(uploadFile).mockRejectedValue(new Error("File too large"));
      const rendered = createDialog(PROJECT_INFO, UPLOAD_FAILED);
      const closeDialog = vi.spyOn(rendered.dialog, "closeDialog");
      pickFile(rendered);

      await submit(rendered);

      expect(processProjectFile).not.toHaveBeenCalled();
      expect(showAlertDialog).toHaveBeenCalledWith(rendered.dialog, {
        title: "Upload fehlgeschlagen",
        text: "File too large",
      });
      expect(closeDialog).not.toHaveBeenCalled();
    });

    it("can retry after a failed attempt", async () => {
      vi.mocked(uploadFile).mockResolvedValue("file-id");
      vi.mocked(processProjectFile)
        .mockRejectedValueOnce({ message: "Invalid password" })
        .mockResolvedValueOnce(undefined);
      const rendered = createDialog();
      const closeDialog = vi.spyOn(rendered.dialog, "closeDialog");
      pickFile(rendered);
      enterPassword(rendered, "wrong");
      await submit(rendered);

      enterPassword(rendered, "right");
      await submit(rendered);

      expect(processProjectFile).toHaveBeenNthCalledWith(1, rendered.hass, "file-id", "wrong");
      expect(processProjectFile).toHaveBeenNthCalledWith(2, rendered.hass, "file-id", "right");
      expect(showAlertDialog).toHaveBeenCalledOnce();
      expect(closeDialog).toHaveBeenCalledOnce();
    });
  });

  describe("closing", () => {
    it("closes on cancel without uploading", () => {
      const { dialog, rerender } = createDialog();
      const closeDialog = vi.spyOn(dialog, "closeDialog");
      // Re-render so the template binds the spied method.
      const container = rerender();

      click(secondaryButton(container));

      expect(closeDialog).toHaveBeenCalledOnce();
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it("closes with the header close button", () => {
      const { dialog, rerender } = createDialog();
      const closeDialog = vi.spyOn(dialog, "closeDialog");
      const container = rerender();

      click(closeButton(container));

      expect(closeDialog).toHaveBeenCalledOnce();
    });

    it("closes when the dialog reports it was closed", () => {
      const { dialog, rerender } = createDialog();
      const closeDialog = vi.spyOn(dialog, "closeDialog");
      const container = rerender();

      container.querySelector("ha-dialog")!.dispatchEvent(new CustomEvent("closed"));

      expect(closeDialog).toHaveBeenCalledOnce();
    });
  });
});

describe("showKnxProjectUploadDialog", () => {
  it("requests the upload dialog with its params", () => {
    const element = document.createElement("div");
    const listener = vi.fn();
    element.addEventListener("show-dialog", listener);
    const params = { hass: createHass(), knx: { projectInfo: null } as unknown as KNX };

    showKnxProjectUploadDialog(element, params);

    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      dialogTag: "knx-project-upload-dialog",
      dialogImport: loadKnxProjectUploadDialog,
      dialogParams: params,
    });
  });

  it("lazily loads the dialog module", async () => {
    const module = await loadKnxProjectUploadDialog();

    expect(module.KnxProjectUploadDialog).toBe(KnxProjectUploadDialog);
  });
});
