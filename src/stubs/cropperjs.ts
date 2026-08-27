// Stub for cropperjs — see build-scripts/stubs.cjs.
//
// image-cropper-dialog imports it statically to crop a picture before uploading it, which
// the KNX panel never does. The methods the dialog calls are all here and all no-ops, so
// the dialog opens on an uncropped image instead of throwing its way through a render.

import { warnStubbed } from "./stub-warning";

export default class Cropper {
  public constructor() {
    warnStubbed("cropperjs", "cropping an uploaded image");
  }

  public getData(): Record<string, never> {
    return {};
  }

  public getImageData(): Record<string, never> {
    return {};
  }

  public getCroppedCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
  }

  public replace(): void {
    // no-op
  }

  public destroy(): void {
    // no-op
  }
}
