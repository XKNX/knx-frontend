import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { keyed } from "lit/directives/keyed";
import { galleryUrl } from "./paths";
import type { GalleryEntry } from "./types";
import en from "./localize/en.json";

@customElement("knx-gallery-thumbnail")
export class KnxGalleryThumbnail extends LitElement {
  @property({ attribute: false }) public entry!: GalleryEntry;
  @property({ type: Boolean }) public dark = false;
  @state() private _loaded = "";
  @state() private _failed = "";

  private _load(event: Event) {
    this._failed = "";
    this._loaded = (event.currentTarget as HTMLImageElement).getAttribute("src")!;
  }
  private _error(event: Event) {
    this._loaded = "";
    this._failed = (event.currentTarget as HTMLImageElement).getAttribute("src")!;
  }

  protected render() {
    const src = galleryUrl(`thumbnails/${this.entry.meta.id}-${this.dark ? "dark" : "light"}.png`);
    const status = this._loaded === src ? "ready" : this._failed === src ? "error" : "loading";
    return html`<div class="preview" data-state=${status}>
      ${status !== "ready" ? html`<span>${status === "error" ? en.failed : en.ui.loading}</span>` : nothing}
      ${keyed(
        src,
        html`<img
          src=${src}
          alt=""
          width="400"
          height="224"
          loading="lazy"
          decoding="async"
          style=${`visibility:${status === "ready" ? "visible" : "hidden"}`}
          @load=${this._load}
          @error=${this._error}
        />`,
      )}
    </div>`;
  }
  static styles = css`
    :host {
      display: block;
    }
    .preview {
      height: 224px;
      position: relative;
      overflow: hidden;
      background: var(--primary-background-color);
    }
    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    span {
      display: grid;
      place-content: center;
      height: 100%;
      padding: 16px;
      box-sizing: border-box;
      color: var(--secondary-text-color);
      font-size: 12px;
      text-align: center;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-gallery-thumbnail": KnxGalleryThumbnail;
  }
}
