import { mdiChevronDown, mdiChevronUp } from "@mdi/js";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "@lit-labs/context";

import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-icon-button";
import { fireEvent } from "@ha/common/dom/fire_event";
import { HomeAssistant } from "@ha/types";

import { KNX } from "../types/knx";
import { DPT, KNXProject, GroupAddress } from "../types/websocket";
import { GASchema } from "../types/entity_data";
import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";

interface GroupAddressSelectorOptions {
  write?: { required: boolean };
  state?: { required: boolean };
  passive?: boolean;
  validDPTs: DPT[];
}

const isValidGroupAddress = (gaDPT: DPT, validDPT: DPT): boolean =>
  gaDPT.main === validDPT.main && validDPT.sub ? gaDPT.sub === validDPT.sub : true;

const getValidGroupAddresses = (knxproject: KNXProject, validDPTs: DPT[]): GroupAddress[] =>
  Object.values(knxproject.group_addresses).filter((groupAddress) =>
    groupAddress.dpt
      ? validDPTs.some((testDPT) => isValidGroupAddress(groupAddress.dpt!, testDPT))
      : false,
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

  @state() private _showPassive = false;

  validGroupAddresses: GroupAddress[] = [];

  addressOptions: { value: string; label: string }[] = [];

  private _validGADropTarget?: boolean;

  @query(".passive") private _passiveContainer!: HTMLDivElement;

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

    return html`<div class="selectors">
        ${this.options.write
          ? html`<ha-selector
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
                @dragenter=${this._dragEnterHandler}
                @dragover=${this._dragOverHandler}
                @drop=${this._dropHandler}
              ></ha-selector
              >${this.options.state || this.options.passive
                ? html`<div class="spacer"></div>`
                : nothing}`
          : nothing}
        ${this.options.state
          ? html`<ha-selector
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
              @dragenter=${this._dragEnterHandler}
              @dragover=${this._dragOverHandler}
              @drop=${this._dropHandler}
            ></ha-selector>`
          : nothing}
        <div
          class="passive ${classMap({
            expanded: alwaysShowPassive || this._showPassive,
          })}"
          @transitionend=${this._handleTransitionEnd}
        >
          <div class="spacer"></div>
          <ha-selector
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
            @dragenter=${this._dragEnterHandler}
            @dragover=${this._dragOverHandler}
            @drop=${this._dropHandler}
          ></ha-selector>
        </div>
      </div>
      <div class="options">
        <ha-icon-button
          .disabled=${!!alwaysShowPassive}
          .path=${this._showPassive ? mdiChevronUp : mdiChevronDown}
          .label=${"Toggle passive address visibility"}
          @click=${this._togglePassiveVisibility}
        ></ha-icon-button>
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

  private _dragEnterHandler(ev: DragEvent) {
    // console.warn("dragEnterHandler", this._dragDropContext);
    if ([...ev.dataTransfer.types].includes("text/group-address")) {
      ev.preventDefault();
      console.warn("dragEnterHandler", ev.target);
    }
  }

  private _dragOverHandler(ev: DragEvent) {
    // console.log("dragOverHandler", ev);
    if ([...ev.dataTransfer.types].includes("text/group-address")) {
      // ev.dataTransfer.dropEffect = "copy";
      ev.preventDefault();
    }
  }

  private _dropHandler(ev: DragEvent) {
    const ga = ev.dataTransfer.getData("text/group-address");
    console.warn("dropHandler", ga);
    if (!ga) {
      return;
    }
    ev.stopPropagation();
    ev.preventDefault();

    const target = ev.target as any;
    console.log("drop target", target);
    if (true) {
      // validate
      if (target.selector.select.multiple) {
        const newValues = [...(this.config[target.key] ?? []), ga];
        this.config = { ...this.config, [target.key]: newValues };
      } else {
        this.config = { ...this.config, [target.key]: ga };
      }
      fireEvent(this, "value-changed", { value: this.config });
    }
  }

  static styles = css`
    :host {
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
    }

    .passive {
      overflow: hidden;
      transition: height 150ms cubic-bezier(0.4, 0, 0.2, 1);
      height: 0px;
    }

    .passive.expanded {
      height: auto;
    }

    .spacer {
      /* ha-selector ignores margin */
      height: 16px;
    }

    ha-selector {
      display: block;
    }

    .valid-drop-zone {
      box-shadow: 0px 0px 5px 2px var(--primary-color);
    }

    .invalid-drop-zone {
      opacity: 0.5;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-group-address-selector": GroupAddressSelector;
  }
}
