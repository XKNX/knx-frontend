/**
 * Everything time-related in the bus scene: the send schedules of the
 * not-found and error stories, the timings of a telegram fired by hand, and
 * the CSS that binds all of it to the scene's elements.
 *
 * Every telegram flies the same way, so one flight description plus start
 * times is all a story needs; the keyframes are generated from that.
 */

export interface BusSchedule {
  /** Length of the loop in seconds. */
  cycle: number;
  /** Start times in seconds; telegrams of one burst fly at the same time. */
  bursts: number[][];
}

/** One flight along the bus, in seconds and SVG user units. */
const FLIGHT = { fadeIn: 0.1, travel: 1.3, fadeOut: 0.2, distance: 224, overshoot: 240 };

/** Bus positions of the three devices, relative to the sender. */
const DEVICE_OFFSETS = [84, 154, 224];

const BLINK = { lead: 0.03, hold: 0.12, tail: 0.24 };
const NO_ACK = { delay: 0.05, hold: 0.45, tail: 0.6 };

/** The house sends as it pleases: alone or in pairs, never more at once. */
export const NOT_FOUND_SCHEDULE: BusSchedule = {
  cycle: 24,
  bursts: [[0.6], [4.4, 4.7], [9.2], [12.6, 13.0], [16.9], [19.4, 19.8]],
};

/** Timings of a telegram fired by hand: one flight, then its LED echoes and no-ACK. */
export const SHOT = {
  flight: FLIGHT.fadeIn + FLIGHT.travel + FLIGHT.fadeOut,
  blink: BLINK.lead + BLINK.tail,
  blinkDelays: DEVICE_OFFSETS.map(
    (offset) => FLIGHT.fadeIn + (offset / FLIGHT.distance) * FLIGHT.travel - BLINK.lead,
  ),
  noAck: NO_ACK.tail - NO_ACK.delay,
  noAckDelay: FLIGHT.fadeIn + FLIGHT.travel + FLIGHT.fadeOut + NO_ACK.delay,
};

/** Delays of the two comet-tail ghosts behind every telegram, in seconds. */
const TAIL = [0.04, 0.08];

export type BusDevice = 1 | 2 | 3;

export interface RejectSchedule {
  /** Length of the loop in seconds. */
  cycle: number;
  /** One telegram at a time, each rejected by the device it is delivered to. */
  sends: { at: number; device: BusDevice }[];
}

/** Timings of a rejected flight: it stops short of the device, bounces and fades. */
const BOUNCE = { stopShort: 12, back: 26, gone: 48, bounce: 0.24, fade: 0.75, flash: 0.9 };

/** When a telegram sent at t=0 reaches device 1-3 (`hit`) and when its story is over (`flight`). */
export const REJECT = {
  hit: Object.fromEntries(
    DEVICE_OFFSETS.map((offset, index) => [
      index + 1,
      FLIGHT.fadeIn + (offset / FLIGHT.distance) * FLIGHT.travel,
    ]),
  ) as Record<BusDevice, number>,
  flight: {} as Record<BusDevice, number>,
  flash: BOUNCE.flash + 0.03,
};
for (const device of [1, 2, 3] as BusDevice[]) {
  REJECT.flight[device] = REJECT.hit[device] + BOUNCE.flash;
}

/** The error story: every telegram is rejected, by a different device each time. */
export const ERROR_SCHEDULE: RejectSchedule = {
  cycle: 15.5,
  sends: [
    { at: 0.5, device: 2 },
    { at: 3.0, device: 1 },
    { at: 5.6, device: 3 },
    { at: 8.2, device: 3 },
    { at: 10.7, device: 1 },
    { at: 13.0, device: 2 },
  ],
};

/** Number of telegrams that can be in flight at once. */
export const laneCount = (schedule: BusSchedule): number =>
  Math.max(...schedule.bursts.map((burst) => burst.length));

/** Start times per lane: the n-th telegram of every burst flies on lane n. */
export const lanes = (schedule: BusSchedule): number[][] => {
  const result: number[][] = Array.from({ length: laneCount(schedule) }, () => []);
  for (const burst of schedule.bursts) {
    burst.forEach((start, index) => result[index].push(start));
  }
  return result;
};

type Frame = [time: number, declarations: string[]];

const percent = (time: number, cycle: number): string =>
  `${Number(((time / cycle) * 100).toFixed(3))}%`;

/** Serialise frames as a keyframes block; later frames win on equal times. */
const keyframes = (name: string, cycle: number, frames: Frame[]): string => {
  const byTime = new Map<number, string[]>();
  for (const [time, declarations] of frames) {
    byTime.set(Math.min(Math.max(time, 0), cycle), declarations);
  }
  const body = [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(
      ([time, declarations]) =>
        `    ${percent(time, cycle)} {\n${declarations.map((d) => `      ${d};`).join("\n")}\n    }`,
    )
    .join("\n");
  return `@keyframes ${name} {\n${body}\n  }`;
};

const at = (x: number, opacity: number): string[] => [
  `transform: translateX(${x}px)`,
  `opacity: ${opacity}`,
];
const LED_OFF = ["fill: var(--knx-bus-scene-line)", "opacity: 0.3"];
const LED_ON = ["fill: var(--knx-bus-scene-reject)", "opacity: 1"];
const BODY_OFF = ["stroke: var(--knx-bus-scene-line)", "stroke-opacity: 0.6"];
const BODY_ON = ["stroke: var(--knx-bus-scene-reject)", "stroke-opacity: 1"];
const HIDDEN = ["opacity: 0"];
const SHOWN = ["opacity: 1"];

const flight = (name: string, starts: number[], cycle: number): string =>
  keyframes(name, cycle, [
    [0, at(0, 0)],
    ...starts.flatMap((start): Frame[] => [
      [start, at(0, 0)],
      [start + FLIGHT.fadeIn, at(0, 1)],
      [start + FLIGHT.fadeIn + FLIGHT.travel, at(FLIGHT.distance, 1)],
      [start + SHOT.flight, at(FLIGHT.overshoot, 0)],
      [start + SHOT.flight + 0.02, at(0, 0)],
    ]),
    [cycle, at(0, 0)],
  ]);

const blink = (name: string, starts: number[], offset: number, cycle: number): string =>
  keyframes(name, cycle, [
    [0, LED_OFF],
    ...starts.flatMap((start): Frame[] => {
      const pass = start + FLIGHT.fadeIn + (offset / FLIGHT.distance) * FLIGHT.travel;
      return [
        [pass - BLINK.lead, LED_OFF],
        [pass, LED_ON],
        [pass + BLINK.hold, LED_ON],
        [pass + BLINK.tail, LED_OFF],
      ];
    }),
    [cycle, LED_OFF],
  ]);

const noAck = (name: string, bursts: number[][], cycle: number): string =>
  keyframes(name, cycle, [
    [0, HIDDEN],
    ...bursts.flatMap((burst): Frame[] => {
      const end = Math.max(...burst) + SHOT.flight;
      return [
        [end, HIDDEN],
        [end + NO_ACK.delay, SHOWN],
        [end + NO_ACK.hold, SHOWN],
        [end + NO_ACK.tail, HIDDEN],
      ];
    }),
    [cycle, HIDDEN],
  ]);

/**
 * Keyframes of the not-found story: `knx-send-<lane>` per lane,
 * `knx-blink-<device>` per device and `knx-no-ack` for the bus end.
 */
export const busSceneKeyframes = (schedule: BusSchedule): string =>
  [
    ...lanes(schedule).map((starts, lane) => flight(`knx-send-${lane}`, starts, schedule.cycle)),
    ...DEVICE_OFFSETS.map((offset, index) =>
      blink(`knx-blink-${index + 1}`, schedule.bursts.flat(), offset, schedule.cycle),
    ),
    noAck("knx-no-ack", schedule.bursts, schedule.cycle),
  ].join("\n\n  ");

/** One-shot keyframes for a fired telegram; durations are the SHOT timings. */
export const shotKeyframes = (): string =>
  [
    keyframes("knx-shot", SHOT.flight, [
      [0, at(0, 0)],
      [FLIGHT.fadeIn, at(0, 1)],
      [FLIGHT.fadeIn + FLIGHT.travel, at(FLIGHT.distance, 1)],
      [SHOT.flight, at(FLIGHT.overshoot, 0)],
    ]),
    keyframes("knx-shot-blink", SHOT.blink, [
      [0, LED_OFF],
      [BLINK.lead, LED_ON],
      [BLINK.lead + BLINK.hold, LED_ON],
      [SHOT.blink, LED_OFF],
    ]),
    keyframes("knx-shot-no-ack", SHOT.noAck, [
      [0, SHOWN],
      [NO_ACK.hold - NO_ACK.delay, SHOWN],
      [SHOT.noAck, HIDDEN],
    ]),
  ].join("\n\n  ");

/** Frames of one rejected flight starting at `start`, aimed at `device`. */
const rejectedFlight = (start: number, device: BusDevice): Frame[] => {
  const x = DEVICE_OFFSETS[device - 1];
  const hit = start + REJECT.hit[device];
  return [
    [start, at(0, 0)],
    [start + FLIGHT.fadeIn, at(0, 1)],
    [hit, at(x - BOUNCE.stopShort, 1)],
    [hit + BOUNCE.bounce, at(x - BOUNCE.back, 1)],
    [hit + BOUNCE.fade, at(x - BOUNCE.gone, 0)],
    [hit + BOUNCE.fade + 0.02, at(0, 0)],
  ];
};

/** Frames of a device flashing its NAK at `hit`: body outline, LED or the label. */
const nakFlash = (hit: number, off: string[], on: string[], lag = 0): Frame[] => [
  [hit - 0.03, off],
  [hit + lag, on],
  [hit + 0.55 + lag, on],
  [hit + BOUNCE.flash, off],
];

/**
 * Keyframes of the error story, per device: `knx-reject-<n>` for the flights
 * to it (each device has its own lane, carrying its own group address),
 * `knx-nak-body-<n>`, `knx-nak-led-<n>` and `knx-nak-text-<n>` for its NAK.
 */
export const errorKeyframes = (schedule: RejectSchedule = ERROR_SCHEDULE): string => {
  const { cycle } = schedule;
  const hits = (device: BusDevice) =>
    schedule.sends
      .filter((send) => send.device === device)
      .map((send) => send.at + REJECT.hit[device]);
  return [
    ...([1, 2, 3] as BusDevice[]).flatMap((device) => [
      keyframes(`knx-reject-${device}`, cycle, [
        [0, at(0, 0)],
        ...schedule.sends
          .filter((send) => send.device === device)
          .flatMap((send) => rejectedFlight(send.at, send.device)),
        [cycle, at(0, 0)],
      ]),
      keyframes(`knx-nak-body-${device}`, cycle, [
        [0, BODY_OFF],
        ...hits(device).flatMap((hit) => nakFlash(hit, BODY_OFF, BODY_ON)),
        [cycle, BODY_OFF],
      ]),
      keyframes(`knx-nak-led-${device}`, cycle, [
        [0, LED_OFF],
        ...hits(device).flatMap((hit) => nakFlash(hit, LED_OFF, LED_ON)),
        [cycle, LED_OFF],
      ]),
      keyframes(`knx-nak-text-${device}`, cycle, [
        [0, HIDDEN],
        ...hits(device).flatMap((hit) => nakFlash(hit, HIDDEN, SHOWN, 0.06)),
        [cycle, HIDDEN],
      ]),
    ]),
  ].join("\n\n  ");
};

/** One-shot keyframes for a fired telegram in the error story: rejected by device 1-3. */
export const shotRejectKeyframes = (): string =>
  [
    ...([1, 2, 3] as BusDevice[]).map((device) =>
      keyframes(`knx-shot-reject-${device}`, REJECT.flight[device], [
        ...rejectedFlight(0, device).slice(0, -1),
        [REJECT.flight[device], at(0, 0)],
      ]),
    ),
    keyframes("knx-shot-nak-body", REJECT.flash, [
      [0, ["stroke-opacity: 0"]],
      [0.03, ["stroke-opacity: 1"]],
      [0.58, ["stroke-opacity: 1"]],
      [REJECT.flash, ["stroke-opacity: 0"]],
    ]),
    keyframes("knx-shot-nak-led", REJECT.flash, [
      [0, HIDDEN],
      [0.03, LED_ON],
      [0.58, LED_ON],
      [REJECT.flash, HIDDEN],
    ]),
    keyframes("knx-shot-nak", REJECT.flash, [
      [0, HIDDEN],
      [0.09, SHOWN],
      [0.64, SHOWN],
      [REJECT.flash, HIDDEN],
    ]),
  ].join("\n\n  ");

const rule = (selector: string, declarations: string): string =>
  `${selector} {\n      ${declarations}\n    }`;

/**
 * The scene's animation CSS: bindings of every element to its track, the
 * hold while the user is sending, and all keyframes of the three stories.
 */
export const busSceneAnimationCss = (schedule: BusSchedule = NOT_FOUND_SCHEDULE): string => {
  const cycle = `${schedule.cycle}s linear infinite`;
  const errorCycle = `${ERROR_SCHEDULE.cycle}s linear infinite`;
  const notFound = (selector: string) => `:host([variant="not-found"]) ${selector}`;
  const error = (selector: string) => `:host([variant="error"]) ${selector}`;
  const devices = [1, 2, 3] as BusDevice[];
  return [
    ...lanes(schedule).map((_, lane) =>
      rule(notFound(`.lane-${lane}`), `animation: knx-send-${lane} ${cycle};`),
    ),
    ...devices.map((device) =>
      rule(notFound(`.device-${device} .led`), `animation: knx-blink-${device} ${cycle};`),
    ),
    rule(notFound(".no-ack"), `animation: knx-no-ack ${cycle};`),
    // error: every telegram is rejected, each by the device it was sent to
    ...devices.flatMap((device) => [
      rule(error(`.reject-lane-${device}`), `animation: knx-reject-${device} ${errorCycle};`),
      rule(error(`.device-${device} .body`), `animation: knx-nak-body-${device} ${errorCycle};`),
      rule(error(`.device-${device} .led`), `animation: knx-nak-led-${device} ${errorCycle};`),
      rule(error(`.nak-${device}`), `animation: knx-nak-text-${device} ${errorCycle};`),
    ]),
    // while the user is sending, the schedule stays off the bus; it starts
    // over from the top of its cycle once the user has been quiet
    rule(
      ":host([busy]) .scheduled,\n    :host([busy]) .device .led,\n    :host([busy]) .device .body,\n    :host([busy]) .no-ack,\n    :host([busy]) .nak",
      "animation: none;",
    ),
    // fired by hand: one flight per tap, self-contained
    rule(".shot .telegram,\n    .shot .ghost", `animation: knx-shot ${SHOT.flight}s linear;`),
    rule(".shot .led-echo", `animation: knx-shot-blink ${SHOT.blink}s linear;`),
    ...SHOT.blinkDelays.map((delay, index) =>
      rule(`.shot .led-echo-${index + 1}`, `animation-delay: ${delay.toFixed(3)}s;`),
    ),
    rule(
      ".shot .shot-no-ack",
      `animation: knx-shot-no-ack ${SHOT.noAck}s linear ${SHOT.noAckDelay}s;`,
    ),
    // fired by hand in the error story: rejected by the device it was sent to
    ...devices.flatMap((device) => {
      const delay = `${(REJECT.hit[device] - 0.03).toFixed(3)}s`;
      return [
        rule(
          `.shot.reject-${device} .telegram,\n    .shot.reject-${device} .ghost`,
          `animation: knx-shot-reject-${device} ${REJECT.flight[device].toFixed(3)}s linear;`,
        ),
        rule(
          `.shot.reject-${device} .body-echo`,
          `animation: knx-shot-nak-body ${REJECT.flash}s linear ${delay};`,
        ),
        rule(
          `.shot.reject-${device} .led-echo`,
          `animation: knx-shot-nak-led ${REJECT.flash}s linear ${delay};`,
        ),
        rule(
          `.shot.reject-${device} .nak-echo`,
          `animation: knx-shot-nak ${REJECT.flash}s linear ${delay};`,
        ),
      ];
    }),
    // comet tail: the same flight a few frames behind; as specific as the lane
    // bindings and declared after them, so the delay survives their shorthand
    ...TAIL.map((delay, index) =>
      rule(`:host .ghost.ghost-${index + 1}`, `animation-delay: ${delay}s;`),
    ),
    busSceneKeyframes(schedule),
    shotKeyframes(),
    shotRejectKeyframes(),
    errorKeyframes(),
  ].join("\n\n    ");
};
