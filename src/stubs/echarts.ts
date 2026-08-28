// Stub for HA's echarts wiring — see build-scripts/stubs.cjs.
//
// Everything under homeassistant-frontend/src/resources/echarts is replaced by this file:
// that directory is the only door echarts, zrender and the chart2music extension come in
// through. The chart components themselves stay — they are small, other modules import
// helpers out of them, and without an engine they simply draw nothing.
//
// ha-chart-base reaches the engine through `(await import(...)).default` and then calls
// `.use()`, `.registerTheme()` and `.init()` on it, and the sankey module's default export
// is called as a function, so the default export here has to be callable *and* answer any
// property with a function. Everything it returns is undefined, which is where a chart that
// really is needed will fail — right after the warning below says why.

import { reportStubbed } from "./stub-report";

reportStubbed("echarts", "drawing charts and graphs");

const noop = (): undefined => undefined;

export default new Proxy(noop, { get: () => noop });

// Used by the energy cards to build gradients.
export const LinearGradient = class StubbedLinearGradient {
  public readonly stubbed = true;
};
