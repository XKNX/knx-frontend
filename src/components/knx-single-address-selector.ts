import type { TemplateResult, HTMLTemplateResult } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-textfield";
import { mdiTextSearchVariant } from "@mdi/js";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import type { GroupAddress } from "../types/websocket";
import type { KNX } from "../types/knx";

@customElement("knx-single-address-selector")
export class KnxSingleAddressSelector extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: String }) public key!: string;

  @property({ type: Number }) public index?: number;

  @property({ attribute: false }) public groupAddresses: GroupAddress[] = [];

  // Optional non-blocking hint (e.g., DPT mismatch)
  @property({ attribute: false }) public hintMessage?: string;

  @property({ type: String }) public value?: string;

  @property() public label?: string;

  @property({ attribute: false }) public parentLabel?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean, reflect: true }) public invalid = false;

  @property({ attribute: false }) public invalidMessage?: string;

  @property({ type: Boolean }) public required = false;

  @state() private _currentName?: string;

  @query("ha-textfield") private _textField?: HTMLElement;

  private _baseTranslation = (
    key: string,
    values?: Record<string, string | number | HTMLTemplateResult | null | undefined>,
  ) =>
    this.hass.localize(
      `component.knx.config_panel.entities.create._.knx.knx_group_address.${key}`,
      values,
    );

  protected willUpdate(changed: Map<string, unknown>) {
    if (changed.has("invalidMessage")) {
      this.invalid = !!this.invalidMessage;
    }

    if (changed.has("value") || changed.has("groupAddresses") || changed.has("knx")) {
      if (this.knx.projectData) {
        let match = this.groupAddresses?.find((ga) => ga.address === this.value);
        if (!match) {
          match = Object.values(this.knx.projectData.group_addresses).find(
            (ga) => ga.address === this.value,
          );
        }
        this._currentName = match?.name;
      }
    }
  }

  protected updated() {
    // show invalid style without adding helper text "Invalid" below
    // helper text is already shown in parent component - it's more width there
    const label = this._textField?.shadowRoot?.querySelector("label");
    if (!label) return;
    if (this.invalid) {
      label.classList.add("mdc-text-field--invalid");
    } else {
      label.classList.remove("mdc-text-field--invalid");
    }
  }

  protected render(): TemplateResult {
    const nameKnown = !!this._currentName;
    const noAddressKnown = !this.value && this.groupAddresses.length === 0;
    const displayName = this.knx?.projectData
      ? (this._currentName ??
        (this.value
          ? this._baseTranslation("group_address_unknown")
          : noAddressKnown
            ? this._baseTranslation("group_address_none_for_dpt")
            : ""))
      : undefined;

    return html`
      <div class="container">
        ${this.knx?.projectData
          ? html`<ha-icon-button
              class="menu-button"
              .disabled=${this.disabled || this.groupAddresses.length === 0}
              .path=${mdiTextSearchVariant}
              .label=${this._baseTranslation("group_address_search")}
              @click=${this._openDialog}
            ></ha-icon-button>`
          : nothing}

        <div class="input-wrap">
          <div class="input-row">
            <ha-textfield
              .disabled=${this.disabled}
              .required=${this.required}
              .value=${this.value ?? ""}
              .label=${this.label ?? ""}
              @input=${this._onInput}
            ></ha-textfield>
            ${displayName
              ? html`<div
                  class="ga-name"
                  ?unknown-ga=${!nameKnown || noAddressKnown}
                  title=${displayName}
                >
                  ${displayName}
                </div>`
              : nothing}
          </div>
        </div>
      </div>
      ${this.hintMessage ? html`<p class="hint-message">${this.hintMessage}</p>` : nothing}
      ${this.invalidMessage ? html`<p class="invalid-message">${this.invalidMessage}</p>` : nothing}
    `;
  }

  private _onInput(ev: Event) {
    const target = ev.target as HTMLInputElement & { value?: string };
    const value = target?.value ?? "";
    this.value = value || undefined;
    fireEvent(this, "value-changed", { value: this.value });
  }

  private _openDialog() {
    fireEvent(this, "show-dialog", {
      dialogTag: "knx-ga-select-dialog",
      dialogImport: () => import("../dialogs/knx-ga-select-dialog"),
      dialogParams: {
        title: `${this.parentLabel ? this.parentLabel + " - " : ""}${this.label ?? ""}`,
        groupAddresses: this.groupAddresses ?? [],
        initialSelection: this.value,
        knx: this.knx,
        onClose: (address?: string) => {
          if (address && address !== this.value) {
            this.value = address;
            fireEvent(this, "value-changed", { value: this.value });
          }
        },
      },
    });
  }

  static styles = css`
    :host {
      display: block;
      margin-bottom: 16px;
      transition:
        box-shadow 250ms,
        opacity 250ms;
    }

    :host([invalid]) {
      color: var(--error-color);
    }

    .container {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .menu-button {
      display: inline-flex;
      align-items: center;
      padding: 4px 0;
    }

    .input-wrap {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: stretch;
      min-width: 0;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    ha-textfield {
      width: 18ch; /* account for label in various languages, not only GA strings */
      flex: 0 0 auto;
      /* prevent content from expanding the field */
      --text-field-overflow: hidden;
    }

    .ga-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.2;
      max-height: calc(2 * 1.2em);
      color: var(--primary-text-color);
    }

    .ga-name[unknown-ga] {
      font-style: italic;
      color: var(--secondary-text-color);
    }

    .invalid-message,
    .hint-message {
      font-size: 0.75rem;
      color: var(--error-color);
      padding-left: 16px;
      margin: 4px 0 0 0;
    }

    .hint-message {
      color: var(--warning-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-single-address-selector": KnxSingleAddressSelector;
  }
}
