import { mdiChevronDown, mdiChevronUp } from "@mdi/js";
import { LitElement, PropertyValues, html, css, nothing } from "lit";
import { customElement, property, state, query, queryAll } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "@lit-labs/context";

import "@ha/components/ha-list-item";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-icon-button";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";
import { isValidDPT } from "../utils/dpt";
import { extractValidationErrors } from "../utils/validation";
import type { GASchemaOptions } from "../utils/schema";
import type { KNX } from "../types/knx";
import type { DPT, GroupAddress } from "../types/websocket";
import type { ErrorDescription, GASchema } from "../types/entity_data";

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

  @property({ type: Object }) public options!: GASchemaOptions;

  @property({ reflect: true }) public key!: string;

  @property({ type: Array }) public validationErrors?: ErrorDescription[];

  @state() private _showPassive = false;

  validGroupAddresses: GroupAddress[] = [];

  filteredGroupAddresses: GroupAddress[] = [];

  addressOptions: { value: string; label: string }[] = [];

  dptSelectorDisabled = false;

  private _validGADropTarget?: boolean;

  private _dragOverTimeout: { [key: string]: NodeJS.Timeout } = {};

  @query(".passive") private _passiveContainer!: HTMLDivElement;

  @queryAll("ha-selector-select") private _gaSelectors!: NodeListOf<HTMLElement>;

  getValidGroupAddresses(validDPTs: DPT[]): GroupAddress[] {
    return this.knx.project
      ? Object.values(this.knx.project.knxproject.group_addresses).filter((groupAddress) =>
          groupAddress.dpt ? isValidDPT(groupAddress.dpt, validDPTs) : false,
        )
      : [];
  }

  getValidDptFromConfigValue(): DPT | undefined {
    return this.config.dpt
      ? this.options.dptSelect?.find((dpt) => dpt.value === this.config.dpt)?.dpt
      : undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    this.validGroupAddresses = this.getValidGroupAddresses(this.options.validDPTs);
    this.filteredGroupAddresses = this.validGroupAddresses;
    this.addressOptions = getAddressOptions(this.filteredGroupAddresses);
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("config")) {
      const selectedDPT = this.getValidDptFromConfigValue();
      if (changedProps.get("config")?.dpt !== this.config.dpt) {
        this.filteredGroupAddresses = selectedDPT
          ? this.getValidGroupAddresses([selectedDPT])
          : this.validGroupAddresses;
        this.addressOptions = getAddressOptions(this.filteredGroupAddresses);
      }
      if (selectedDPT && this.knx.project?.project_loaded) {
        const allDpts = [
          this.config.write,
          this.config.state,
          ...(this.config.passive ?? []),
        ].filter((ga) => ga != null);
        this.dptSelectorDisabled = allDpts.every((ga) => {
          const _dpt = this.knx.project?.knxproject.group_addresses[ga!].dpt;
          return _dpt ? isValidDPT(_dpt, [selectedDPT]) : false;
        });
      } else {
        this.dptSelectorDisabled = false;
      }
    }

    this._validGADropTarget = this._dragDropContext?.groupAddress
      ? this.filteredGroupAddresses.includes(this._dragDropContext.groupAddress)
      : undefined;
  }

  protected updated(changedProps: PropertyValues) {
    if (!changedProps.has("validationErrors")) return;
    this._gaSelectors.forEach(async (selector) => {
      await selector.updateComplete;
      const firstError = extractValidationErrors(this.validationErrors, selector.key)?.[0];
      selector.comboBox.errorMessage = firstError?.error_message;
      selector.comboBox.invalid = !!firstError;
    });
  }

  render() {
    const alwaysShowPassive = this.config.passive && this.config.passive.length > 0;

    const validGADropTargetClass = this._validGADropTarget === true;
    const invalidGADropTargetClass = this._validGADropTarget === false;

    return html` <div class="main">
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
      </div>
      ${this.options.dptSelect
        ? html`<ha-selector-select
            .hass=${this.hass}
            .key=${"dpt"}
            .label=${"Datapoint type"}
            .required=${true}
            .selector=${{
              select: {
                multiple: false,
                custom_value: false,
                options: this.options.dptSelect,
              },
            }}
            .value=${this.config.dpt}
            .disabled=${this.dptSelectorDisabled}
            @value-changed=${this._updateConfig}
          >
          </ha-selector-select>`
        : nothing}`;
  }

  private _updateConfig(ev: CustomEvent) {
    ev.stopPropagation();
    const target = ev.target as any;
    const value = ev.detail.value;
    const newConfig = { ...this.config, [target.key]: value };
    this._updateDptSelector(target.key, newConfig);
    this.config = newConfig;
    fireEvent(this, "value-changed", { value: this.config });
    this.requestUpdate();
  }

  private _updateDptSelector(targetKey: string, newConfig: GASchema) {
    if (!(this.options.dptSelect && this.knx.project?.project_loaded)) return;
    // updates newConfig in place
    let newGa: string | undefined;
    if (targetKey === "write" || targetKey === "state") {
      newGa = newConfig[targetKey];
    } else if (targetKey === "passive") {
      // for passive ignore removals, only use additions
      const addedGa = newConfig.passive?.filter((ga) => !this.config.passive?.includes(ga))?.[0];
      newGa = addedGa;
    } else {
      return;
    }
    // disable when project is loaded and everything matches -> not here
    if (!newConfig.write && !newConfig.state && !newConfig.passive?.length) {
      // when all GAs have been cleared, reset dpt field
      newConfig.dpt = undefined;
    }
    if (this.config.dpt === undefined) {
      const newDpt = this.validGroupAddresses.find((ga) => ga.address === newGa)?.dpt;
      if (!newDpt) return;
      const exactDptMatch = this.options.dptSelect.find(
        (dptOption) => dptOption.dpt.main === newDpt.main && dptOption.dpt.sub === newDpt.sub,
      );
      const newDptValue = exactDptMatch
        ? exactDptMatch.value
        : // fallback to first valid DPT if allowed in options; otherwise undefined
          this.options.dptSelect.find((dptOption) => isValidDPT(newDpt, [dptOption.dpt]))?.value;
      newConfig.dpt = newDptValue;
    }
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
    const newConfig = { ...this.config };
    if (target.selector.select.multiple) {
      const newValues = [...(this.config[target.key] ?? []), ga];
      newConfig[target.key] = newValues;
    } else {
      newConfig[target.key] = ga;
    }
    this._updateDptSelector(target.key, newConfig);
    fireEvent(this, "value-changed", { value: newConfig });
    // reset invalid state of textfield if set before drag
    setTimeout(() => target.comboBox._inputElement.blur());
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
