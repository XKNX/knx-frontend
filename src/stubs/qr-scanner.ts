// Stub for qr-scanner — see build-scripts/stubs.cjs.
//
// ha-qr-scanner bails out with "no camera found" when `hasCamera()` is false, which is the
// closest thing to the truth: this build has no scanner to point a camera at.

import { warnStubbed } from "./stub-warning";

warnStubbed("qr-scanner", "scanning QR codes with the camera");

export default {
  hasCamera: (): Promise<boolean> => Promise.resolve(false),
};
