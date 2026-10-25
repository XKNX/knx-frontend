import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { exitFlow, navigateInFlow, navigateToError } from "./navigation";

const navigateMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock("@ha/common/navigate", () => ({
  navigate: navigateMock,
  updateHistoryState: (patch: Record<string, unknown>) => {
    fakeMainWindow.history.state = { ...fakeMainWindow.history.state, ...patch };
  },
}));

/** Minimal `mainWindow` stub - jsdom doesn't allow manipulating `history.length`. */
const fakeMainWindow = vi.hoisted(() => {
  const target = new EventTarget();
  return {
    history: {
      length: 1,
      state: null as {
        dialog?: string;
        root?: boolean;
        message?: string;
        retryPath?: string;
      } | null,
      back: vi.fn(),
    },
    location: { pathname: "/knx/entities/create/switch", search: "", hash: "" },
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (handle?: any) => clearTimeout(handle),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
});
vi.mock("@ha/common/dom/get_main_window", () => ({ mainWindow: fakeMainWindow }));

describe("navigateInFlow", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("replaces the current history entry", () => {
    navigateInFlow("/knx/entities/create/switch");
    expect(navigateMock).toHaveBeenCalledWith("/knx/entities/create/switch", { replace: true });
  });
});

describe("navigateToError", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    fakeMainWindow.history.state = null;
    fakeMainWindow.location.pathname = "/knx/entities/create/switch";
    fakeMainWindow.location.search = "";
    fakeMainWindow.location.hash = "";
  });

  afterEach(() => {
    fakeMainWindow.location.pathname = "/knx/entities/create/switch";
  });

  it("replaces the failed page with the error page and remembers where it happened", () => {
    navigateToError(new Error("Connection lost"));
    expect(navigateMock).toHaveBeenCalledWith("/knx/error", {
      replace: true,
      data: { message: "Connection lost", retryPath: "/knx/entities/create/switch" },
    });
  });

  it("keeps the query of the failed page, which flows read their presets from", () => {
    fakeMainWindow.location.search = "?preset=light";
    fakeMainWindow.location.hash = "#step";
    navigateToError("boom");
    expect(navigateMock).toHaveBeenCalledWith("/knx/error", {
      replace: true,
      data: { message: "boom", retryPath: "/knx/entities/create/switch?preset=light#step" },
    });
  });

  it("keeps the shown error when a second call fails", async () => {
    // a second call failing shortly after the first - eg. a delayed validation
    fakeMainWindow.location.pathname = "/knx/error";
    const shown = {
      message: "Connection lost",
      retryPath: "/knx/entities/create/switch?preset=light",
    };
    fakeMainWindow.history.state = shown;

    await expect(navigateToError(new Error("Validation failed"))).resolves.toBe(false);

    expect(navigateMock).not.toHaveBeenCalled();
    expect(fakeMainWindow.history.state).toBe(shown);
  });

  it("keeps the error details on the first history entry of a tab", async () => {
    // `navigate()` replaces the data of the root entry with its `root` marker
    fakeMainWindow.history.state = { root: true };
    navigateMock.mockImplementationOnce(() => {
      fakeMainWindow.history.state = { root: true };
      return Promise.resolve(true);
    });

    await navigateToError(new Error("Connection lost"));

    expect(fakeMainWindow.history.state).toEqual({
      root: true,
      message: "Connection lost",
      retryPath: "/knx/entities/create/switch",
    });
  });

  it("leaves the history state alone when the navigation was blocked", async () => {
    // eg. a dialog refused to close
    navigateMock.mockImplementationOnce(() => Promise.resolve(false));

    await navigateToError(new Error("Connection lost"));

    expect(fakeMainWindow.history.state).toBeNull();
  });
});

describe("exitFlow", () => {
  /** `history.back()` as the browser does it: moves the location and fires `popstate`. */
  const goBackToView = () => {
    fakeMainWindow.location.pathname = "/knx/entities/view";
    fakeMainWindow.dispatchEvent(new Event("popstate"));
  };

  beforeEach(() => {
    navigateMock.mockClear();
    fakeMainWindow.history.back.mockClear();
    fakeMainWindow.history.length = 1;
    fakeMainWindow.history.state = null;
    fakeMainWindow.location.pathname = "/knx/entities/create/switch";
    fakeMainWindow.location.search = "";
    fakeMainWindow.location.hash = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    fakeMainWindow.location.pathname = "/knx/entities/create/switch";
  });

  it("goes back to the page the flow was entered from", async () => {
    fakeMainWindow.history.length = 3;
    fakeMainWindow.history.back.mockImplementation(goBackToView);

    await exitFlow("/knx/entities/view");

    expect(fakeMainWindow.history.back).toHaveBeenCalledOnce();
    // no new history entry is created when leaving the flow
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navigates to the fallback path when there is no history to go back to", async () => {
    // eg. the flow was opened directly by URL
    await exitFlow("/knx/entities/view");

    expect(fakeMainWindow.history.back).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/knx/entities/view", { replace: true });
  });

  it("waits for an open dialog to drop its history entry before going back", async () => {
    // a dialog - eg. the unsaved changes confirmation - removes its own entry when closed
    fakeMainWindow.history.length = 3;
    fakeMainWindow.history.state = { dialog: "dialog-box" };
    fakeMainWindow.history.back.mockImplementation(goBackToView);

    const exited = exitFlow("/knx/entities/view");
    await new Promise((resolve) => {
      setTimeout(resolve);
    });
    // still waiting for the dialog - going back now would only close it
    expect(fakeMainWindow.history.back).not.toHaveBeenCalled();

    // the dialog dropped its entry
    fakeMainWindow.history.state = null;
    fakeMainWindow.dispatchEvent(new Event("popstate"));
    await exited;

    expect(fakeMainWindow.history.back).toHaveBeenCalledOnce();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("replaces the flow entry with the fallback path when going back did not happen", async () => {
    // the browser dropped or delayed the traversal - the flow page is still shown when the
    // safety net fires. Resolving then would let a dialog opened next land on top of the flow.
    vi.useFakeTimers();
    fakeMainWindow.history.length = 3;
    fakeMainWindow.history.back.mockImplementation(() => undefined);

    const exited = exitFlow("/knx/entities/view");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(exited).resolves.toBeUndefined();

    expect(fakeMainWindow.history.back).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledWith("/knx/entities/view", { replace: true });
  });

  it("replaces the flow entry when a popstate did not leave the flow page", async () => {
    // a history change that isn't the traversal - the flow is still the current entry
    fakeMainWindow.history.length = 3;
    fakeMainWindow.history.back.mockImplementation(() => {
      fakeMainWindow.dispatchEvent(new Event("popstate"));
    });

    await exitFlow("/knx/entities/view");

    expect(navigateMock).toHaveBeenCalledWith("/knx/entities/view", { replace: true });
  });
});
