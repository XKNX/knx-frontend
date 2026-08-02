import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { exitFlow, navigateInFlow } from "./navigation";

const navigateMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock("@ha/common/navigate", () => ({ navigate: navigateMock }));

/** Minimal `mainWindow` stub - jsdom doesn't allow manipulating `history.length`. */
const fakeMainWindow = vi.hoisted(() => {
  const target = new EventTarget();
  return {
    history: {
      length: 1,
      state: null as { dialog?: string } | null,
      back: vi.fn(),
    },
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

describe("exitFlow", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    fakeMainWindow.history.back.mockClear();
    fakeMainWindow.history.length = 1;
    fakeMainWindow.history.state = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("goes back to the page the flow was entered from", async () => {
    fakeMainWindow.history.length = 3;
    fakeMainWindow.history.back.mockImplementation(() => {
      fakeMainWindow.dispatchEvent(new Event("popstate"));
    });

    await exitFlow("/knx/entities");

    expect(fakeMainWindow.history.back).toHaveBeenCalledOnce();
    // no new history entry is created when leaving the flow
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navigates to the fallback path when there is no history to go back to", async () => {
    // eg. the flow was opened directly by URL
    await exitFlow("/knx/entities");

    expect(fakeMainWindow.history.back).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/knx/entities", { replace: true });
  });

  it("waits for an open dialog to drop its history entry before going back", async () => {
    // a dialog - eg. the unsaved changes confirmation - removes its own entry when closed
    fakeMainWindow.history.length = 3;
    fakeMainWindow.history.state = { dialog: "dialog-box" };
    fakeMainWindow.history.back.mockImplementation(() => {
      fakeMainWindow.dispatchEvent(new Event("popstate"));
    });

    const exited = exitFlow("/knx/entities");
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
  });

  it("resolves when no popstate is fired for the traversal", async () => {
    vi.useFakeTimers();
    fakeMainWindow.history.length = 3;
    fakeMainWindow.history.back.mockImplementation(() => undefined);

    const exited = exitFlow("/knx/entities");
    await vi.advanceTimersByTimeAsync(1000);

    await expect(exited).resolves.toBeUndefined();
  });
});
