import type { TemplateResult } from "lit";
import { svg } from "lit";

/** The Home Assistant logo, paths from ha-logo-svg, sitting on the bus drop. */
export const haLogo = svg`
  <svg class="ha-logo" viewBox="0 0 240 240" x="21" y="40" width="30" height="30">
    <path
      class="house"
      d="M240 224.762a15 15 0 0 1-15 15H15a15 15 0 0 1-15-15v-90c0-8.25 4.77-19.769 10.61-25.609l98.78-98.7805c5.83-5.83 15.38-5.83 21.21 0l98.79 98.7895c5.83 5.83 10.61 17.36 10.61 25.61v90-.01Z"
    />
    <path
      class="tree"
      d="m107.27 239.762-40.63-40.63c-2.09.72-4.32 1.13-6.64 1.13-11.3 0-20.5-9.2-20.5-20.5s9.2-20.5 20.5-20.5 20.5 9.2 20.5 20.5c0 2.33-.41 4.56-1.13 6.65l31.63 31.63v-115.88c-6.8-3.3395-11.5-10.3195-11.5-18.3895 0-11.3 9.2-20.5 20.5-20.5s20.5 9.2 20.5 20.5c0 8.07-4.7 15.05-11.5 18.3895v81.27l31.46-31.46c-.62-1.96-.96-4.04-.96-6.2 0-11.3 9.2-20.5 20.5-20.5s20.5 9.2 20.5 20.5-9.2 20.5-20.5 20.5c-2.5 0-4.88-.47-7.09-1.29L129 208.892v30.88z"
    />
  </svg>
`;

const GLYPHS: ((x: number) => TemplateResult)[] = [
  // switch actuator: two channel keys
  (x) => svg`
    <rect class="glyph fill" x=${x - 11} y="53" width="12" height="3" rx="1.5" />
    <rect class="glyph fill" x=${x - 11} y="60" width="12" height="3" rx="1.5" />
  `,
  // thermostat: a dial
  (x) => svg`
    <circle class="glyph line" cx=${x - 5} cy="58" r="5.5" />
    <line class="glyph line" x1=${x - 5} y1="58" x2=${x - 2} y2="54.5" />
  `,
  // motion sensor: a beam
  (x) => svg`
    <circle class="glyph fill" cx=${x - 10} cy="63" r="1.6" />
    <path class="glyph line" d="M ${x - 10} 58.5 A 4.5 4.5 0 0 1 ${x - 5.5} 63" />
    <path class="glyph line" d="M ${x - 10} 54 A 9 9 0 0 1 ${x - 1} 63" />
  `,
];

/** A bus device at `x`; `index` (1-3) picks the glyph and the CSS hooks. */
export const busDevice = (x: number, index: number): TemplateResult => svg`
  <g class="device device-${index}">
    <line class="drop" x1=${x} y1="70" x2=${x} y2="84" />
    <rect class="body" x=${x - 17} y="46" width="34" height="24" rx="5" />
    ${GLYPHS[index - 1](x)}
    <circle class="led" cx=${x + 10} cy="53" r="2.5" />
  </g>
`;

/** A telegram at the sender: comet tail, dot and destination badge, all tagged with `classes`. */
export const telegram = (classes: string, address: string): TemplateResult => svg`
  <g class="ghost ghost-2 ${classes}"><circle cx="36" cy="84" r="2.5" /></g>
  <g class="ghost ghost-1 ${classes}"><circle cx="36" cy="84" r="3.2" /></g>
  <g class="telegram ${classes}">
    <circle class="halo" cx="36" cy="84" r="9" />
    <circle class="dot" cx="36" cy="84" r="4" />
    <rect class="badge" x="19" y="94" width="34" height="14" rx="7" />
    <text x="36" y="104" text-anchor="middle">${address}</text>
  </g>
`;
