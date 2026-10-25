import { afterEach, describe, expect, it } from "vitest";

import type { ShowToastParams } from "@ha/managers/notification-manager";

import { showToast } from "./toast";

const listen = (target: EventTarget) => {
  const received: ShowToastParams[] = [];
  target.addEventListener("hass-notification", (ev) => {
    received.push((ev as CustomEvent<ShowToastParams>).detail);
  });
  return received;
};

describe("showToast", () => {
  afterEach(() => {
    delete (window as any).customPanel;
  });

  it("fires the notification on the main window's panel element when embedded in an iframe", () => {
    const mainWindowPanel = document.createElement("div");
    (window as any).customPanel = mainWindowPanel;
    const element = document.createElement("div");
    const onPanel = listen(mainWindowPanel);
    const onElement = listen(element);

    showToast(element, { message: "Hello" });

    expect(onPanel).toEqual([{ message: "Hello" }]);
    expect(onElement).toEqual([]);
  });

  it("fires the notification on the element itself without an iframe", () => {
    const element = document.createElement("div");
    const onElement = listen(element);

    showToast(element, { message: "Hello" });

    expect(onElement).toEqual([{ message: "Hello" }]);
  });
});
