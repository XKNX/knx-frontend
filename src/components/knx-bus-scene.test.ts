import { afterEach, describe, expect, it, vi } from "vitest";

import { KnxBusScene } from "./knx-bus-scene";

describe("KnxBusScene", () => {
  let element: KnxBusScene;

  afterEach(() => {
    element?.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const mount = async (variant: KnxBusScene["variant"]) => {
    element = new KnxBusScene();
    element.variant = variant;
    document.body.appendChild(element);
    await element.updateComplete;
    return element;
  };

  /** The page reports a tap; the scene reacts at once. */
  const tap = async (times = 1, spacing = 0) => {
    for (let i = 0; i < times; i++) {
      element.fire();
      if (spacing) {
        vi.advanceTimersByTime(spacing);
      }
    }
    await element.updateComplete;
  };

  const count = (selector: string) => element.shadowRoot?.querySelectorAll(selector).length;

  const endStory = async (shot: Element | null | undefined) => {
    shot?.dispatchEvent(
      Object.assign(new Event("animationend", { bubbles: true }), {
        animationName: "knx-shot-no-ack",
      }),
    );
    await element.updateComplete;
  };

  it("reflects the variant so the styles can pick the story", async () => {
    await mount("error");
    expect(element.getAttribute("variant")).toBe("error");
  });

  it("is hidden from assistive technology as a decorative graphic", async () => {
    await mount("not-found");
    expect(element.getAttribute("aria-hidden")).toBe("true");
  });

  it("sends every scheduled telegram of the not-found story to 4/0/4", async () => {
    await mount("not-found");
    const badges = [...(element.shadowRoot?.querySelectorAll(".scheduled.telegram text") ?? [])];
    expect(badges.length).toBeGreaterThan(0);
    expect(new Set(badges.map((text) => text.textContent))).toEqual(new Set(["4/0/4"]));
  });

  it("puts one telegram on the bus per tap and removes it once its story has ended", async () => {
    await mount("not-found");
    await tap(2);
    expect(count(".shot")).toBe(2);
    // the flight ending is not the end of the story, the no-ACK is
    element.shadowRoot
      ?.querySelector(".shot")
      ?.dispatchEvent(
        Object.assign(new Event("animationend", { bubbles: true }), { animationName: "knx-shot" }),
      );
    await element.updateComplete;
    expect(count(".shot")).toBe(2);
    await endStory(element.shadowRoot?.querySelector(".shot"));
    expect(count(".shot")).toBe(1);
  });

  it("sends nothing by hand under reduced motion, where a shot could never end", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    await mount("not-found");
    const haptics: string[] = [];
    const listener = (ev: Event) => haptics.push((ev as CustomEvent).detail);
    window.addEventListener("haptic", listener);
    try {
      await tap(3);
    } finally {
      window.removeEventListener("haptic", listener);
    }
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(count(".shot")).toBe(0);
    expect(count(".ripple")).toBe(0);
    // the tap is still acknowledged
    expect(haptics).toHaveLength(3);
    expect(element.hasAttribute("busy")).toBe(true);
  });

  it("ripples behind the still logo, once per tap", async () => {
    await mount("not-found");
    await tap(2);
    const children = [...(element.shadowRoot?.querySelector(".sender")?.children ?? [])];
    const ripples = children.filter((child) => child.classList.contains("ripple"));
    const logo = children.findIndex((child) => child.classList.contains("ha-logo"));
    expect(ripples).toHaveLength(2);
    // SVG paints in document order, so the ripples must come before the logo
    expect(children.indexOf(ripples[1])).toBeLessThan(logo);
    expect(element.shadowRoot?.querySelector(".ha-logo")?.getAnimations?.()).toBeUndefined();
  });

  it("asks Home Assistant for a light haptic on every tap", async () => {
    await mount("not-found");
    const haptics: string[] = [];
    const listener = (ev: Event) => haptics.push((ev as CustomEvent).detail);
    window.addEventListener("haptic", listener);
    try {
      await tap(2);
    } finally {
      window.removeEventListener("haptic", listener);
    }
    expect(haptics).toEqual(["light", "light"]);
  });

  describe("in the error story", () => {
    it("hands each fired telegram to a random device that rejects it", async () => {
      vi.spyOn(Math, "random")
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.99);
      await mount("error");
      await tap(3);
      const targets = [...(element.shadowRoot?.querySelectorAll(".shot") ?? [])].map((shot) =>
        shot.getAttribute("class"),
      );
      expect(targets).toEqual(["shot reject-1", "shot reject-2", "shot reject-3"]);
      expect(count(".shot .nak-echo")).toBe(3);
    });

    it("addresses every telegram to its device's group address, an HTTP status code", async () => {
      vi.spyOn(Math, "random").mockReturnValueOnce(0.5);
      await mount("error");
      await tap();
      const badge = (selector: string) =>
        element.shadowRoot?.querySelector(`${selector} text`)?.textContent;
      expect(badge(".shot.reject-2 .telegram")).toBe("5/0/0");
      expect(badge(".telegram.reject-lane-1")).toBe("4/0/3");
      expect(badge(".telegram.reject-lane-3")).toBe("5/0/3");
      expect(count(".scheduled.telegram")).toBe(3);
    });

    it("removes a fired telegram once its NAK has faded", async () => {
      await mount("error");
      await tap();
      element.shadowRoot?.querySelector(".shot .nak-echo")?.dispatchEvent(
        Object.assign(new Event("animationend", { bubbles: true }), {
          animationName: "knx-shot-nak",
        }),
      );
      await element.updateComplete;
      expect(count(".shot")).toBe(0);
    });
  });

  describe("bus load readout", () => {
    const load = () => element.style.getPropertyValue("--knx-bus-scene-load");

    it("stays hidden for a single tap", async () => {
      vi.useFakeTimers();
      await mount("not-found");
      await tap();
      expect(load()).toBe("0");
    });

    it("shows the taps of the last second once the rate is high", async () => {
      vi.useFakeTimers();
      await mount("not-found");
      await tap(7, 60);
      expect(load()).toBe("1");
      expect(element.shadowRoot?.querySelector(".rate-value")?.textContent).toBe("7");
    });

    it("fades out and stops ticking once the taps are over", async () => {
      vi.useFakeTimers();
      await mount("not-found");
      await tap(7, 60);
      vi.advanceTimersByTime(1700);
      expect(load()).toBe("0");
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("while the user is sending", () => {
    it("holds the scheduled telegrams back until 1.5 seconds of quiet", async () => {
      vi.useFakeTimers();
      await mount("not-found");
      await tap();
      expect(element.hasAttribute("busy")).toBe(true);
      vi.advanceTimersByTime(1400);
      await element.updateComplete;
      expect(element.hasAttribute("busy")).toBe(true);
      vi.advanceTimersByTime(200);
      await element.updateComplete;
      expect(element.hasAttribute("busy")).toBe(false);
    });

    it("lets the schedule go when removed while on hold", async () => {
      vi.useFakeTimers();
      await mount("not-found");
      await tap();
      element.remove();
      await element.updateComplete;
      expect(element.hasAttribute("busy")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps waiting as long as taps keep coming", async () => {
      vi.useFakeTimers();
      await mount("not-found");
      await tap(2, 1000);
      await element.updateComplete;
      expect(element.hasAttribute("busy")).toBe(true);
    });

    it("holds back only the scheduled telegrams, never the user's own", async () => {
      vi.useFakeTimers();
      await mount("not-found");
      await tap();
      expect(element.shadowRoot?.querySelector(".telegram.lane-0")?.classList).toContain(
        "scheduled",
      );
      expect(element.shadowRoot?.querySelector(".shot .telegram")?.classList).not.toContain(
        "scheduled",
      );
    });
  });
});
