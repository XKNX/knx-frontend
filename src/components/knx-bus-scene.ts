import type { TemplateResult } from "lit";
import { css, html, LitElement, svg, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";

import { fireEvent } from "@ha/common/dom/fire_event";
import { mainWindow } from "@ha/common/dom/get_main_window";
import type { HapticType } from "@ha/data/haptics";

import { busSceneAnimationCss, laneCount, NOT_FOUND_SCHEDULE } from "./knx-bus-scene-animations";
import type { BusDevice } from "./knx-bus-scene-animations";
import { busDevice, haLogo, telegram } from "./knx-bus-scene-artwork";

export type KnxBusSceneVariant = "not-found" | "error";

const LANES = laneCount(NOT_FOUND_SCHEDULE);

/** Bus positions of the three devices. */
const DEVICE_X: Record<BusDevice, number> = { 1: 120, 2: 190, 3: 260 };

/**
 * Group addresses as HTTP status codes: nobody listens to 4/0/4, and in the
 * error story the devices reject 4/0/3, 5/0/0 and 5/0/3.
 */
const NOBODY = "4/0/4";
const DEVICE_ADDRESS: Record<BusDevice, string> = { 1: "4/0/3", 2: "5/0/0", 3: "5/0/3" };

/** Telegram rate readout: taps within the window, faded in between the thresholds. */
const RATE = { window: 1000, fadeFrom: 2, fadeTo: 6, tick: 100 };

/** The scheduled telegrams stay off the bus until the user has been quiet this long. */
const QUIET_AFTER_TAP = 1500;

/**
 * Decorative KNX bus line with telegrams travelling along it.
 *
 * - `not-found`: the house sends telegrams for group address 4/0/4 the way a
 *   house does, following `NOT_FOUND_SCHEDULE`. Every device blinks them
 *   away and nobody answers.
 * - `error`: every telegram is addressed to one of the devices (4/0/3,
 *   5/0/0, 5/0/3), which rejects it (NAK), following `ERROR_SCHEDULE`.
 *
 * `fire()` sends a telegram by hand: a ripple spreads out behind the logo,
 * the companion app is asked for a light haptic, and the telegram brings its
 * own LED echoes and no-ACK (or, in the error story, its own NAK at a random
 * device) before removing itself. Tap fast and a
 * telegrams-per-second readout fades in while the bus line fills with KNX
 * blue. While the user is sending, the scheduled telegrams stay off the bus.
 *
 * Pure SVG + CSS keyframes; timers only tick while the user is tapping.
 * Honours `prefers-reduced-motion` by showing the end of the story instead.
 */
@customElement("knx-bus-scene")
export class KnxBusScene extends LitElement {
  @property({ reflect: true }) public variant: KnxBusSceneVariant = "not-found";

  /** Set while the user is sending; the scheduled telegrams pause meanwhile. */
  @property({ type: Boolean, reflect: true }) public busy = false;

  /** Unit label of the rate readout, localised by the view. */
  @property({ attribute: "rate-unit" }) public rateUnit = "telegrams/s";

  /** Telegrams fired by hand within the last second. */
  @state() private _rate = 0;

  /** Telegrams fired by hand whose story is still running. */
  @state() private _sent: { id: number; device?: BusDevice }[] = [];

  private _nextId = 0;

  private _tapTimes: number[] = [];

  private _rateTick?: number;

  private _quietTimer?: number;

  protected render(): TemplateResult {
    return html`
      <svg viewBox="0 0 320 118" xmlns="http://www.w3.org/2000/svg">
        <!-- bus line: twisted pair, drawn as two hairlines, plus the load overlay -->
        <line class="bus" x1="12" y1="84" x2="308" y2="84" />
        <line class="bus bus-shadow" x1="12" y1="87" x2="308" y2="87" />
        <line class="bus-load" x1="12" y1="84" x2="308" y2="84" />

        <!-- bus load readout, only visible when the house is tapped fast -->
        <g class="rate">
          <text class="rate-value" x="308" y="27" text-anchor="end">${this._rate}</text>
          <text class="rate-unit" x="308" y="37" text-anchor="end">${this.rateUnit}</text>
        </g>

        <!-- sender: Home Assistant, with one ripple per tap behind the logo -->
        <g class="sender">
          <line class="drop" x1="36" y1="70" x2="36" y2="84" />
          ${repeat(
            this._sent,
            (sent) => sent.id,
            () => svg`<circle class="ripple" cx="36" cy="55" r="16" />`,
          )}
          ${haLogo}
        </g>

        ${busDevice(DEVICE_X[1], 1)} ${busDevice(DEVICE_X[2], 2)} ${busDevice(DEVICE_X[3], 3)}

        <!-- what the bus answers: nothing at all, or a NAK from the addressed device -->
        <text class="no-ack" x="308" y="79" text-anchor="end">no ACK</text>
        ${([1, 2, 3] as BusDevice[]).map(
          (device) =>
            svg`<text class="nak nak-${device}" x=${DEVICE_X[device]} y="38" text-anchor="middle">NAK</text>`,
        )}
        ${
          this.variant === "error"
            ? ([1, 2, 3] as BusDevice[]).map((device) =>
                telegram(`scheduled reject-lane-${device}`, DEVICE_ADDRESS[device]),
              )
            : Array.from({ length: LANES }, (_, lane) => telegram(`scheduled lane-${lane}`, NOBODY))
        }
        ${repeat(this._sent, (sent) => sent.id, this._renderShot)}
      </svg>
    `;
  }

  /**
   * A telegram fired by hand with its own answer: in the not-found story LED
   * echoes at every device and a no-ACK, in the error story a NAK at the
   * device it was sent to.
   */
  private _renderShot = ({ id, device }: { id: number; device?: BusDevice }): TemplateResult => {
    if (device) {
      const x = DEVICE_X[device];
      return svg`
        <g class="shot reject-${device}" data-id=${id} @animationend=${this._shotEnded}>
          ${telegram("", DEVICE_ADDRESS[device])}
          <rect class="body-echo" x=${x - 17} y="46" width="34" height="24" rx="5" />
          <circle class="led-echo" cx=${x + 10} cy="53" r="2.5" />
          <text class="nak-echo" x=${x} y="38" text-anchor="middle">NAK</text>
        </g>
      `;
    }
    return svg`
      <g class="shot" data-id=${id} @animationend=${this._shotEnded}>
        ${telegram("", NOBODY)}
        <circle class="led-echo led-echo-1" cx="130" cy="53" r="2.5" />
        <circle class="led-echo led-echo-2" cx="200" cy="53" r="2.5" />
        <circle class="led-echo led-echo-3" cx="270" cy="53" r="2.5" />
        <text class="shot-no-ack" x="308" y="79" text-anchor="end">no ACK</text>
      </g>
    `;
  };

  /** Send one telegram by hand; in the error story a random device rejects it. */
  public fire(): void {
    const device =
      this.variant === "error" ? ((1 + Math.floor(Math.random() * 3)) as BusDevice) : undefined;
    this._sent = [...this._sent, { id: this._nextId++, device }];
    fireEvent(mainWindow, "haptic", "light" satisfies HapticType);
    this._tapTimes.push(Date.now());
    this._updateRate();
    this._holdSchedule();
  }

  /** The answer is the last animation of a shot; when it ends, the shot is done. */
  private _shotEnded = (ev: AnimationEvent): void => {
    if (ev.animationName !== "knx-shot-no-ack" && ev.animationName !== "knx-shot-nak") {
      return;
    }
    const id = Number((ev.currentTarget as SVGGElement).dataset.id);
    this._sent = this._sent.filter((sent) => sent.id !== id);
  };

  /** Keep the schedule off the bus until the user has been quiet for a while. */
  private _holdSchedule(): void {
    this.busy = true;
    window.clearTimeout(this._quietTimer);
    this._quietTimer = window.setTimeout(() => {
      this._quietTimer = undefined;
      this.busy = false;
    }, QUIET_AFTER_TAP);
  }

  /** Recount the taps of the last second and keep ticking while any remain. */
  private _updateRate(): void {
    const since = Date.now() - RATE.window;
    this._tapTimes = this._tapTimes.filter((tap) => tap > since);
    this._rate = this._tapTimes.length;
    const load = (this._rate - RATE.fadeFrom) / (RATE.fadeTo - RATE.fadeFrom);
    this.style.setProperty("--knx-bus-scene-load", String(Math.min(Math.max(load, 0), 1)));
    if (this._tapTimes.length && this._rateTick === undefined) {
      this._rateTick = window.setTimeout(() => {
        this._rateTick = undefined;
        this._updateRate();
      }, RATE.tick);
    }
  }

  protected firstUpdated(): void {
    this.setAttribute("aria-hidden", "true");
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._rateTick);
    window.clearTimeout(this._quietTimer);
    this._rateTick = this._quietTimer = undefined;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      max-width: 400px;
      --knx-bus-scene-line: var(--secondary-text-color);
      --knx-bus-scene-device: var(--card-background-color);
      /* same fill + white text as the "Outgoing" badge in the group monitor */
      --knx-bus-scene-telegram: var(--knx-blue, var(--primary-color));
      --knx-bus-scene-on-telegram: var(--text-primary-color, #fff);
      --knx-bus-scene-reject: var(--error-color);
      /* --knx-bus-scene-load (0..1) is set inline by _updateRate */
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .bus,
    .drop {
      stroke: var(--knx-bus-scene-line);
      stroke-width: 1.5;
      stroke-linecap: round;
      opacity: 0.55;
    }

    .bus-shadow {
      opacity: 0.2;
    }

    .drop {
      opacity: 0.4;
    }

    /* bus load: the line fills with KNX blue as the rate climbs */
    .bus-load {
      stroke: var(--knx-bus-scene-telegram);
      stroke-width: 2.2;
      stroke-linecap: round;
      opacity: calc(var(--knx-bus-scene-load, 0) * 0.85);
      transition: opacity 250ms ease;
    }

    .rate {
      opacity: var(--knx-bus-scene-load, 0);
      transition: opacity 250ms ease;
    }

    .rate-value {
      font-family: var(--ha-font-family-code, monospace);
      font-size: 24px;
      font-weight: var(--ha-font-weight-medium, 500);
      font-variant-numeric: tabular-nums;
      fill: var(--primary-text-color);
    }

    .rate-unit {
      font-size: 6.5px;
      font-weight: var(--ha-font-weight-medium, 500);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      fill: var(--secondary-text-color);
    }

    /* brand colours as in ha-logo-svg, readable on light and dark themes */
    .sender .house,
    .sender .ripple {
      fill: #18bcf2;
    }

    .sender .tree {
      fill: #f2f4f9;
    }

    /* one ripple per tap, spreading out behind the logo, each on its own */
    .sender .ripple {
      opacity: 0;
      transform-box: fill-box;
      transform-origin: center;
      animation: knx-ripple 550ms ease-out;
    }

    @keyframes knx-ripple {
      0% {
        transform: scale(0.6);
        opacity: 0.4;
      }
      100% {
        transform: scale(2.4);
        opacity: 0;
      }
    }

    .device .body {
      fill: var(--knx-bus-scene-device);
      stroke: var(--knx-bus-scene-line);
      stroke-width: 1.5;
      stroke-opacity: 0.6;
    }

    .device .glyph {
      opacity: 0.4;
    }

    .device .glyph.fill {
      fill: var(--knx-bus-scene-line);
    }

    .device .glyph.line {
      fill: none;
      stroke: var(--knx-bus-scene-line);
      stroke-width: 1.5;
      stroke-linecap: round;
    }

    .device .led,
    .shot .led-echo {
      fill: var(--knx-bus-scene-line);
      opacity: 0.3;
    }

    .shot .led-echo {
      opacity: 0;
    }

    .shot .body-echo {
      fill: none;
      stroke: var(--knx-bus-scene-reject);
      stroke-width: 1.5;
      stroke-opacity: 0;
    }

    /* telegrams are invisible until their keyframes bring them onto the bus */
    .telegram,
    .ghost {
      opacity: 0;
    }

    .telegram .dot {
      fill: var(--knx-bus-scene-telegram);
      stroke: var(--primary-background-color);
      stroke-width: 1.5;
    }

    .telegram .halo,
    .telegram .badge,
    .ghost circle {
      fill: var(--knx-bus-scene-telegram);
    }

    .telegram .halo {
      opacity: 0.25;
    }

    .ghost-1 circle {
      opacity: 0.35;
    }

    .ghost-2 circle {
      opacity: 0.16;
    }

    .telegram text {
      font-family: var(--ha-font-family-code, monospace);
      font-size: 9px;
      fill: var(--knx-bus-scene-on-telegram);
    }

    .no-ack,
    .shot-no-ack,
    .nak,
    .nak-echo {
      font-family: var(--ha-font-family-code, monospace);
      font-size: 8px;
      letter-spacing: 0.08em;
      fill: var(--knx-bus-scene-reject);
      opacity: 0;
    }

    /* all animation bindings and keyframes, see knx-bus-scene-animations.ts */
    ${unsafeCSS(busSceneAnimationCss())}

    /* ---- reduced motion: show the end of the story instead ------------- */
    @media (prefers-reduced-motion: reduce) {
      .telegram,
      .device .led,
      .device .body,
      .no-ack,
      .nak {
        animation: none !important;
      }

      .ghost,
      .shot,
      .sender .ripple {
        display: none;
      }

      :host([variant="not-found"]) .telegram.lane-0 {
        transform: translateX(224px);
        opacity: 0.6;
      }

      :host([variant="not-found"]) .no-ack,
      :host([variant="error"]) .nak-1 {
        opacity: 1;
      }

      :host([variant="error"]) .telegram.reject-lane-1 {
        transform: translateX(58px);
        opacity: 1;
      }

      :host([variant="error"]) .device-1 .body {
        stroke: var(--knx-bus-scene-reject);
        stroke-opacity: 1;
      }

      :host([variant="error"]) .device-1 .led {
        fill: var(--knx-bus-scene-reject);
        opacity: 1;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-bus-scene": KnxBusScene;
  }
}
