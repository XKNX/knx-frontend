// Stub for hls.js — see build-scripts/stubs.cjs.
//
// ha-hls-player asks `Hls.isSupported()` first and falls back to the browser's own HLS
// support, then to a "video not supported" message. Reporting false walks it down that
// path instead of leaving it with a broken player object.

import { reportStubbed } from "./stub-report";

reportStubbed("hls.js", "playing camera streams that the browser cannot play natively");

export default {
  isSupported: (): boolean => false,
};
