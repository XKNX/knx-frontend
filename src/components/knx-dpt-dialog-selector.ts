import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-formfield";
import "@ha/components/ha-radio";
import "@ha/components/ha-icon-button";
import { mdiClose, mdiMenuOpen } from "@mdi/js";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import type { KNX } from "../types/knx";

@customElement("knx-dpt-dialog-selector")
class KnxDptDialogSelector extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false, type: Array }) public validDPTs?: string[];

  @property() public value?: string;

  @property() public label?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean, reflect: true }) public invalid = false;

  @property({ attribute: false }) public invalidMessage?: string;

  @property({ attribute: false }) public localizeValue: (value: string) => string = (key: string) =>
    key;

  @property({ type: String }) public translation_key?: string;

  render() {
    return html`
      <div>
        ${this.label ?? nothing}
        <div class="knx-dpt-selector">
          <ha-icon-button
            class="menu-button"
            .path=${mdiMenuOpen}
            @click=${this._openDialog}
            label="Select DPT"
          ></ha-icon-button>

          ${this.value
            ? html`<div class="selected">
                  <div class="dpt-number">${this.value}</div>
                  <div class="dpt-name">${this.knx.dptMetadata[this.value]?.name}</div>
                  <div class="dpt-unit">${this.knx.dptMetadata[this.value]?.unit ?? ""}</div>
                </div>
                <ha-icon-button
                  class="clear-button"
                  .path=${mdiClose}
                  .label=${this.hass.localize ? this.hass.localize("ui.common.clear") : "Clear"}
                  @click=${this._clearSelection}
                ></ha-icon-button>`
            : html`<div>Select DPT</div>`}
        </div>
        ${this.invalidMessage
          ? html`<p class="invalid-message">${this.invalidMessage}</p>`
          : nothing}
      </div>
    `;
  }

  private _clearSelection(): void {
    if (!this.value) return;
    this.value = undefined;
    fireEvent(this, "value-changed", { value: this.value });
  }

  private _openDialog() {
    fireEvent(this, "show-dialog", {
      dialogTag: "knx-dpt-select-dialog",
      dialogImport: () => import("../dialogs/knx-dpt-select-dialog"),
      dialogParams: (() => {
        const filtered = (() => {
          // If caller provided explicit valid DPT keys, use them to filter metadata.
          if (!this.knx?.dptMetadata) return {} as Record<string, any>;
          if (this.validDPTs && this.validDPTs.length) {
            const set = new Set(this.validDPTs);
            return Object.fromEntries(
              Object.entries(this.knx.dptMetadata).filter(([k]) => set.has(k)),
            );
          }
          // Fallback: no explicit validDPTs provided — pass whole metadata mapping
          return { ...this.knx.dptMetadata };
        })();

        return {
          title: this.hass.localize ? this.hass.localize("ui.common.select") : "Select DPT",
          // `dpts` must be a Record<string, DPTMetadata> — pass filtered mapping (may be empty)
          dpts: filtered,
          initialSelection: this.value,
          onClose: (dpt: string | undefined) => {
            if (!dpt) return;
            if (dpt === this.value) return;
            this.value = dpt;
            fireEvent(this, "value-changed", { value: this.value });
          },
        };
      })(),
    });
  }

  static styles = [
    css`
      :host([invalid]) div {
        color: var(--error-color);
      }

      p {
        pointer-events: none;
        color: var(--primary-text-color);
        margin: 0px;
      }

      .invalid-message {
        font-size: 0.75rem;
        color: var(--error-color);
        padding-left: 16px;
      }

      .knx-dpt-selector {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .knx-dpt-selector .selected {
        display: grid;
        /* first column adapts to content, middle column gets remaining space (shrinkable)
           last column adapts to content as well (auto) — only the middle column truncates */
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        flex: 1 1 auto;
        min-width: 160px;
      }

      .menu-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
      }

      /* Removed unused selectors: .formfield, label, .secondary, .menu-label */

      .clear-button {
        margin-left: 8px;
      }

      .dpt-number {
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Courier New", monospace;
        color: var(--secondary-text-color);
      }

      .dpt-name {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        /* allow the grid to shrink this column correctly */
        min-width: 0;
      }

      .dpt-number {
        white-space: nowrap;
      }

      .dpt-unit {
        text-align: right;
        color: var(--secondary-text-color);
        white-space: nowrap;
        padding-left: 6px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-dpt-dialog-selector": KnxDptDialogSelector;
  }
}
