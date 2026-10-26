import { LitElement, html, css } from "lit";
import { repeat } from "lit/directives/repeat";
import { customElement, property, query } from "lit/decorators";
import "@ha/components/ha-button";
import { fireEvent } from "@ha/common/dom/fire_event";
import en from "./localize/en.json";
import { galleryStyles } from "./styles";
import type { GalleryEvent } from "./types";

declare global {
  interface HASSDomEvents {
    "clear-log": undefined;
  }
}

@customElement("knx-gallery-event-log")
export class KnxGalleryEventLog extends LitElement {
  @property({ attribute: false }) public events: GalleryEvent[] = [];
  @property({ type: Boolean, reflect: true }) public open = false;
  @query("ol") private _list?: HTMLOListElement;
  private _clear() {
    fireEvent(this, "clear-log");
  }
  private _toggle(ev: Event) {
    this.open = (ev.currentTarget as HTMLDetailsElement).open;
    if (this.open && this._list) this._list.scrollTop = 0;
  }
  protected render() {
    const latest = this.events[this.events.length - 1];
    const errors = this.events.filter((event) => event.kind === "error").length;
    return html`<details class="console" .open=${this.open} @toggle=${this._toggle}>
      <summary class="console-heading">
        <span>${en.ui.log} (${this.events.length})</span>
        <span class="latest-event">${latest ? latest.name : en.ui.emptyLog}</span>
        ${errors ? html`<span class="error">${en.ui.error} · ${errors}</span>` : ""}
      </summary>
      <div class="console-body">
        <div class="console-tools">
          <small>${en.ui.logLimit}</small
          ><ha-button appearance="plain" size="s" @click=${this._clear}>${en.ui.clear}</ha-button>
        </div>
        <ol>
          ${repeat(
            [...this.events].reverse(),
            (item) => item,
            (item) =>
              html`<li>
                <details>
                  <summary>
                    <time>${new Date(item.timestamp).toLocaleTimeString()}</time>
                    <strong class=${item.kind === "error" ? "error" : ""}
                      >${item.kind}: ${item.name}</strong
                    >
                  </summary>
                  <pre>${JSON.stringify(item.args, null, 2)}</pre>
                </details>
              </li>`,
          )}
        </ol>
        ${!this.events.length ? html`<p class="muted">${en.ui.emptyLog}</p>` : ""}
      </div>
    </details>`;
  }
  static styles = [
    galleryStyles,
    css`
      :host {
        border: 1px solid var(--divider-color);
        border-radius: 10px;
        background: var(--card-background-color);
        overflow: hidden;
      }
      details {
        margin: 0;
      }
      .console-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        font-size: 12px;
        white-space: nowrap;
      }
      .console-heading::before {
        content: "▸";
      }
      .console[open] > .console-heading::before {
        transform: rotate(90deg);
      }
      .latest-event {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--secondary-text-color);
        font-weight: 400;
      }
      .console-body {
        border-top: 1px solid var(--divider-color);
        height: min(240px, 32dvh);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0 14px;
      }
      .console-tools {
        display: flex;
        flex: none;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding-block: 4px;
      }
      ol {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 0;
        margin: 0;
        list-style: none;
      }
      li {
        border-top: 1px solid var(--divider-color);
        font-size: 12px;
      }
      li summary {
        font-weight: 400;
      }
      time {
        margin-inline-end: 12px;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      @media (max-width: 700px) {
        .console-heading {
          gap: 8px;
        }
      }
    `,
  ];
}
declare global {
  interface HTMLElementTagNameMap {
    "knx-gallery-event-log": KnxGalleryEventLog;
  }
}
