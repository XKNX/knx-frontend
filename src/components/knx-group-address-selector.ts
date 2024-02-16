import { mdiChevronDown, mdiChevronUp } from "@mdi/js";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "@lit-labs/context";

import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-icon-button";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";
import { isValidDPT } from "../utils/dpt";
import type { KNX } from "../types/knx";
import type { DPT, KNXProject, GroupAddress } from "../types/websocket";
import type { GASchema } from "../types/entity_data";

interface GroupAddressSelectorOptions {
  write?: { required: boolean };
  state?: { required: boolean };
  passive?: boolean;
  validDPTs: DPT[];
}

const getValidGroupAddresses = (knxproject: KNXProject, validDPTs: DPT[]): GroupAddress[] =>
  Object.values(knxproject.group_addresses).filter((groupAddress) =>
    groupAddress.dpt ? isValidDPT(groupAddress.dpt, validDPTs) : false,
  );

const getAddressOptions = (
  validGroupAddresses: GroupAddress[],
): { value: string; label: string }[] =>
  validGroupAddresses.map((groupAddress) => ({
    value: groupAddress.address,
    label: `${groupAddress.address} - ${groupAddress.name}`,
  }));

@customElement("knx-group-address-selector")
export class GroupAddressSelector extends LitElement {
  @consume({ context: dragDropContext, subscribe: true }) _dragDropContext?: DragDropContext;

  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ type: Object }) public knx!: KNX;

  @property({ type: Object }) public config: GASchema = {};

  @property({ type: Object }) public options!: GroupAddressSelectorOptions;

  @property({ reflect: true }) public key!: string;

  @state() private _showPassive = false;

  validGroupAddresses: GroupAddress[] = [];

  addressOptions: { value: string; label: string }[] = [];

  private _validGADropTarget?: boolean;

  private _dragOverTimeout: { [key: string]: NodeJS.Timeout } = {};

  @query(".passive") private _passiveContainer!: HTMLDivElement;

  // @query("ha-combo-box") private _comboBox!: any;

  connectedCallback() {
    super.connectedCallback();
    this.validGroupAddresses = this.knx.project
      ? getValidGroupAddresses(this.knx.project.knxproject, this.options.validDPTs)
      : [];
    this.addressOptions = getAddressOptions(this.validGroupAddresses);
  }

  protected willUpdate() {
    this._validGADropTarget = this._dragDropContext?.groupAddress
      ? this.validGroupAddresses.includes(this._dragDropContext.groupAddress)
      : undefined;
  }

  render() {
    const alwaysShowPassive = this.config.passive && this.config.passive.length > 0;

    const validGADropTargetClass =
      this._validGADropTarget === undefined ? false : this._validGADropTarget;
    const invalidGADropTargetClass =
      this._validGADropTarget === undefined ? false : !this._validGADropTarget;

    return html`<div class="main">
        <div class="selectors">
          ${this.options.write
            ? html`<ha-selector-select
                class=${classMap({
                  "valid-drop-zone": validGADropTargetClass,
                  "invalid-drop-zone": invalidGADropTargetClass,
                })}
                .hass=${this.hass}
                .label=${"Send address"}
                .required=${this.options.write.required}
                .selector=${{
                  select: { multiple: false, custom_value: true, options: this.addressOptions },
                }}
                .key=${"write"}
                .value=${this.config.write}
                @value-changed=${this._updateConfig}
                @dragover=${this._dragOverHandler}
                @drop=${this._dropHandler}
              ></ha-selector-select>`
            : nothing}
          ${this.options.state
            ? html`<ha-selector-select
                class=${classMap({
                  "valid-drop-zone": validGADropTargetClass,
                  "invalid-drop-zone": invalidGADropTargetClass,
                })}
                .hass=${this.hass}
                .label=${"State address"}
                .required=${this.options.state.required}
                .selector=${{
                  select: { multiple: false, custom_value: true, options: this.addressOptions },
                }}
                .key=${"state"}
                .value=${this.config.state}
                @value-changed=${this._updateConfig}
                @dragover=${this._dragOverHandler}
                @drop=${this._dropHandler}
              ></ha-selector-select>`
            : nothing}
        </div>
        <div class="options">
          <ha-icon-button
            .disabled=${!!alwaysShowPassive}
            .path=${this._showPassive ? mdiChevronUp : mdiChevronDown}
            .label=${"Toggle passive address visibility"}
            @click=${this._togglePassiveVisibility}
          ></ha-icon-button>
        </div>
      </div>
      <div
        class="passive ${classMap({
          expanded: alwaysShowPassive || this._showPassive,
        })}"
        @transitionend=${this._handleTransitionEnd}
      >
        <ha-selector-select
          class=${classMap({
            "valid-drop-zone": validGADropTargetClass,
            "invalid-drop-zone": invalidGADropTargetClass,
          })}
          .hass=${this.hass}
          .label=${"Passive addresses"}
          .required=${false}
          .selector=${{
            select: { multiple: true, custom_value: true, options: this.addressOptions },
          }}
          .key=${"passive"}
          .value=${this.config.passive}
          @value-changed=${this._updateConfig}
          @dragover=${this._dragOverHandler}
          @drop=${this._dropHandler}
        ></ha-selector-select>
      </div> `;
  }

  private _updateConfig(ev: CustomEvent) {
    ev.stopPropagation();
    const target = ev.target as any;
    const value = ev.detail.value;
    this.config = { ...this.config, [target.key]: value };
    if (true) {
      // validate
      fireEvent(this, "value-changed", { value: this.config });
    }
    this.requestUpdate();
  }

  private _togglePassiveVisibility(ev: CustomEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    const newExpanded = !this._showPassive;
    this._passiveContainer.style.overflow = "hidden";

    const scrollHeight = this._passiveContainer.scrollHeight;
    this._passiveContainer.style.height = `${scrollHeight}px`;

    if (!newExpanded) {
      setTimeout(() => {
        this._passiveContainer.style.height = "0px";
      }, 0);
    }
    this._showPassive = newExpanded;
  }

  private _handleTransitionEnd() {
    this._passiveContainer.style.removeProperty("height");
    this._passiveContainer.style.overflow = this._showPassive ? "initial" : "hidden";
  }

  private _dragOverHandler(ev: DragEvent) {
    // dragEnter is immediately followed by dragLeave for unknown reason
    // (I think some pointer events in the selectors shadow-dom)
    // so we debounce dragOver to fake it
    if (![...ev.dataTransfer.types].includes("text/group-address")) {
      return;
    }
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";

    const target = ev.target as any;
    if (this._dragOverTimeout[target.key]) {
      clearTimeout(this._dragOverTimeout[target.key]);
    } else {
      // fake dragEnterHandler
      target.classList.add("active-drop-zone");
    }
    this._dragOverTimeout[target.key] = setTimeout(() => {
      delete this._dragOverTimeout[target.key];
      // fake dragLeaveHandler
      target.classList.remove("active-drop-zone");
    }, 100);
  }

  private _dropHandler(ev: DragEvent) {
    const ga = ev.dataTransfer.getData("text/group-address");
    if (!ga) {
      return;
    }
    ev.stopPropagation();
    ev.preventDefault();

    const target = ev.target as any;
    if (true) {
      // validate
      if (target.selector.select.multiple) {
        const newValues = [...(this.config[target.key] ?? []), ga];
        this.config = { ...this.config, [target.key]: newValues };
      } else {
        this.config = { ...this.config, [target.key]: ga };
      }
      fireEvent(this, "value-changed", { value: this.config });
      // reset invalid state of textfield if set before drag
      setTimeout(() => target.comboBox._inputElement.blur());
    }
  }

  static styles = css`
    .main {
      display: flex;
      flex-direction: row;
    }

    .selectors {
      flex: 1;
      padding-right: 16px;
    }

    .options {
      width: 48px;
      display: flex;
      flex-direction: column-reverse;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .passive {
      overflow: hidden;
      transition: height 150ms cubic-bezier(0.4, 0, 0.2, 1);
      height: 0px;
      margin-right: 64px; /* compensate for .options */
    }

    .passive.expanded {
      height: auto;
    }

    ha-selector-select {
      display: block;
      margin-bottom: 16px;
      transition:
        box-shadow 250ms,
        opacity 250ms;
    }

    .valid-drop-zone {
      box-shadow: 0px 0px 5px 2px rgba(var(--rgb-primary-color), 0.5);
    }

    .valid-drop-zone.active-drop-zone {
      box-shadow: 0px 0px 5px 2px var(--primary-color);
    }

    .invalid-drop-zone {
      opacity: 0.5;
    }

    .invalid-drop-zone.active-drop-zone {
      box-shadow: 0px 0px 5px 2px var(--error-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-group-address-selector": GroupAddressSelector;
  }
}
