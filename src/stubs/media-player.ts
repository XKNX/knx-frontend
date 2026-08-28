// Stub for HA's media browser — see build-scripts/stubs.cjs.
//
// KNX has no media_player entities, so nothing in the panel can open a media browser. The
// `show-*-dialog` helpers are deliberately left alone: they are what other components
// import by name, and what they open is this.

import { reportStubbed } from "./stub-report";

class StubbedMediaElement extends HTMLElement {
  public connectedCallback(): void {
    reportStubbed("media browser", `showing <${this.localName}>`);
  }
}

for (const tagName of [
  "dialog-join-media-players",
  "dialog-media-manage",
  "dialog-media-player-browse",
  "ha-browse-media-manual",
  "ha-browse-media-tts",
  "ha-media-browser-thumbnail",
  "ha-media-manage-button",
  "ha-media-player-browse",
  "ha-media-upload-button",
]) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, class extends StubbedMediaElement {});
  }
}
