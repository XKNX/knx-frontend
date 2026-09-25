import { describe, expect, it } from "vitest";

import {
  busSceneAnimationCss,
  busSceneKeyframes,
  ERROR_SCHEDULE,
  errorKeyframes,
  lanes,
  NOT_FOUND_SCHEDULE,
  REJECT,
  SHOT,
  type BusSchedule,
} from "./knx-bus-scene-animations";

const schedule: BusSchedule = { cycle: 10, bursts: [[0.5], [3, 3.3], [7, 7.4]] };

/** One keyframes block of the generated CSS. */
const block = (css: string, name: string): string =>
  css.split(`@keyframes ${name} {`)[1]?.split("\n  }")[0] ?? "";

/** The "12.5%" selectors of a block, in source order. */
const percentagesOf = (css: string, name: string): number[] =>
  [...block(css, name).matchAll(/(\d+(?:\.\d+)?)%/g)].map((match) => Number(match[1]));

describe("lanes", () => {
  it("puts the telegrams of one burst on separate lanes", () => {
    expect(lanes(schedule)).toEqual([
      [0.5, 3, 7],
      [3.3, 7.4],
    ]);
  });
});

describe("busSceneKeyframes", () => {
  const css = busSceneKeyframes(schedule);

  it("writes every track with ascending keyframes from 0% to 100%", () => {
    for (const name of ["knx-send-0", "knx-send-1", "knx-blink-1", "knx-blink-3", "knx-no-ack"]) {
      const percentages = percentagesOf(css, name);
      expect(percentages.length, name).toBeGreaterThan(2);
      expect(percentages[0], name).toBe(0);
      expect(percentages[percentages.length - 1], name).toBe(100);
      for (let i = 1; i < percentages.length; i++) {
        expect(percentages[i], name).toBeGreaterThanOrEqual(percentages[i - 1]);
      }
    }
  });

  it("blinks each device once per telegram and shows no ACK once per burst", () => {
    // an "on" phase is two frames; 5 telegrams, 3 bursts
    expect(block(css, "knx-blink-2").match(/--knx-bus-scene-reject/g)).toHaveLength(5 * 2);
    expect(block(css, "knx-no-ack").match(/opacity: 1/g)).toHaveLength(3 * 2);
  });
});

describe("NOT_FOUND_SCHEDULE", () => {
  it("sends alone or in pairs and finishes every flight within the cycle", () => {
    const sizes = new Set(NOT_FOUND_SCHEDULE.bursts.map((burst) => burst.length));
    expect([...sizes].sort()).toEqual([1, 2]);
    const last = Math.max(...NOT_FOUND_SCHEDULE.bursts.flat());
    expect(last + SHOT.noAckDelay + SHOT.noAck).toBeLessThanOrEqual(NOT_FOUND_SCHEDULE.cycle);
  });
});

describe("ERROR_SCHEDULE", () => {
  it("delivers to every device, one telegram at a time, within the cycle", () => {
    const devices = new Set(ERROR_SCHEDULE.sends.map((send) => send.device));
    expect([...devices].sort()).toEqual([1, 2, 3]);
    const starts = ERROR_SCHEDULE.sends.map((send) => send.at);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(REJECT.flight[3]);
    }
    expect(starts[starts.length - 1] + REJECT.flight[3]).toBeLessThanOrEqual(ERROR_SCHEDULE.cycle);
  });
});

describe("errorKeyframes", () => {
  const css = errorKeyframes({
    cycle: 10,
    sends: [
      { at: 0.5, device: 2 },
      { at: 3, device: 1 },
      { at: 6, device: 2 },
    ],
  });

  it("flashes each device once per telegram it rejects", () => {
    expect(block(css, "knx-nak-led-2").match(/--knx-bus-scene-reject/g)).toHaveLength(2 * 2);
    expect(block(css, "knx-nak-led-1").match(/--knx-bus-scene-reject/g)).toHaveLength(1 * 2);
    expect(block(css, "knx-nak-text-3").match(/opacity: 1/g)).toBeNull();
  });

  it("flies each device's telegrams on that device's lane and stops short of it", () => {
    expect(block(css, "knx-reject-2")).toContain("translateX(142px)");
    expect(block(css, "knx-reject-2")).not.toContain("translateX(72px)");
    expect(block(css, "knx-reject-1")).toContain("translateX(72px)");
    expect(block(css, "knx-reject-3")).not.toContain("opacity: 1");
  });
});

describe("busSceneAnimationCss", () => {
  const css = busSceneAnimationCss(schedule);

  it("binds every lane, device and answer of all three stories to its track", () => {
    for (const binding of [
      ':host([variant="not-found"]) .lane-1 {\n      animation: knx-send-1 10s',
      ':host([variant="not-found"]) .device-3 .led {\n      animation: knx-blink-3 10s',
      ':host([variant="not-found"]) .no-ack {\n      animation: knx-no-ack 10s',
      ".shot .telegram,\n    .shot .ghost {\n      animation: knx-shot",
      ".shot .led-echo-2 {\n      animation-delay:",
      ".shot .shot-no-ack {\n      animation: knx-shot-no-ack",
      ':host([variant="error"]) .reject-lane-2 {\n      animation: knx-reject-2',
      ':host([variant="error"]) .device-2 .led {\n      animation: knx-nak-led-2',
      ':host([variant="error"]) .nak-3 {\n      animation: knx-nak-text-3',
      ".shot.reject-3 .telegram,\n    .shot.reject-3 .ghost {\n      animation: knx-shot-reject-3",
      ".shot.reject-1 .nak-echo {\n      animation: knx-shot-nak",
      ":host([busy]) .scheduled",
    ]) {
      expect(css).toContain(binding);
    }
    for (const name of [
      "knx-shot",
      "knx-shot-blink",
      "knx-shot-no-ack",
      "knx-shot-reject-2",
      "knx-shot-nak",
      "knx-reject-1",
      "knx-nak-text-1",
    ]) {
      expect(css).toContain(`@keyframes ${name} {`);
    }
  });

  it("times the LED echoes of a fired telegram to its flight", () => {
    expect(SHOT.blinkDelays).toHaveLength(3);
    expect(SHOT.blinkDelays[0]).toBeLessThan(SHOT.blinkDelays[2]);
    expect(SHOT.blinkDelays[2]).toBeLessThan(SHOT.flight);
    expect(SHOT.noAckDelay).toBeGreaterThanOrEqual(SHOT.flight);
  });
});
