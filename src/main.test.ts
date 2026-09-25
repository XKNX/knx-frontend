import { beforeAll, describe, expect, it, vi } from "vitest";

import type { HomeAssistant } from "@ha/types";
import { clearBrandsTokenRefresh, fetchAndScheduleBrandsAccessToken } from "@ha/util/brands-url";
import type * as BrandsUrl from "@ha/util/brands-url";

import type { KNX } from "./types/knx";
import "./main";

vi.mock("@ha/util/brands-url", async (importOriginal) => ({
  ...(await importOriginal<typeof BrandsUrl>()),
  clearBrandsTokenRefresh: vi.fn(),
  fetchAndScheduleBrandsAccessToken: vi.fn(),
}));
vi.mock("@ha/common/dom/media_query", () => ({ listenMediaQuery: vi.fn() }));
vi.mock("@ha/common/dom/apply_themes_on_element", () => ({ applyThemesOnElement: vi.fn() }));
vi.mock("@ha/resources/append-ha-style", () => ({}));
vi.mock("@ha/common/util/compute_rtl", () => ({
  computeRTL: vi.fn(),
  computeDirectionStyles: vi.fn(),
}));
vi.mock("@ha/dialogs/make-dialog-manager", () => ({ makeDialogManager: vi.fn() }));

describe("KNX brand token", () => {
  beforeAll(() => {
    vi.spyOn(window, "focus").mockReturnValue(undefined);
  });

  it.each([
    [true, true],
    [true, false],
    [false, true],
  ])("handles connected=%s and tokenChanged=%s", async (connected, tokenChanged) => {
    vi.mocked(fetchAndScheduleBrandsAccessToken).mockResolvedValue(tokenChanged);
    vi.mocked(clearBrandsTokenRefresh).mockClear();

    const view = document.createElement("knx-frontend");
    view.hass = {
      language: "en",
      translationMetadata: { translations: {} },
    } as unknown as HomeAssistant;
    view.knx = {} as KNX;
    Object.defineProperty(view, "isConnected", { value: connected });
    const lifecycle = view as unknown as Record<string, () => void>;
    vi.spyOn(lifecycle, "hassConnected").mockReturnValue(undefined);
    const updateHass = vi.spyOn(lifecycle, "_updateHass").mockReturnValue(undefined);
    (view as unknown as { _translationsLoaded: boolean })._translationsLoaded = true;

    await (
      view as unknown as { firstUpdated: (props: Map<string, unknown>) => Promise<void> }
    ).firstUpdated(new Map());

    expect(fetchAndScheduleBrandsAccessToken).toHaveBeenCalledWith(view.hass);
    expect(updateHass).toHaveBeenCalledTimes(connected && tokenChanged ? 1 : 0);
    expect(clearBrandsTokenRefresh).toHaveBeenCalledTimes(connected ? 0 : 1);
  });

  it("clears the refresh timer when the panel disconnects", () => {
    vi.mocked(clearBrandsTokenRefresh).mockClear();
    document.createElement("knx-frontend").disconnectedCallback();
    expect(clearBrandsTokenRefresh).toHaveBeenCalledOnce();
  });
});
