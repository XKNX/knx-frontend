import { mdiChevronDown, mdiChevronUp, mdiAlertCircleOutline } from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query, queryAll } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "@lit-labs/context";
import memoize from "memoize-one";

import "@ha/components/ha-list-item";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-icon-button";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import "./knx-dpt-selector";
import type { DragDropContext } from "../utils/drag-drop-context";
import { dragDropContext } from "../utils/drag-drop-context";
import { isValidDPT } from "../utils/dpt";
import { getValidationError } from "../utils/validation";
import type { GASelectorOptions, DPTOption } from "../utils/schema";
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

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property() public label?: string;

  @property({ attribute: false }) public config: GASchema = {};

  @property({ attribute: false }) public options!: GASelectorOptions;

  @property({ reflect: true }) public key!: string;

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  @state() private _showPassive = false;

  private _selectedDPTValue?: string;

  validGroupAddresses: GroupAddress[] = [];

  filteredGroupAddresses: GroupAddress[] = [];

  addressOptions: { value: string; label: string }[] = [];

  dptSelectorDisabled = false;

  private _validGADropTarget?: boolean;

  private _dragOverTimeout: Record<string, NodeJS.Timeout> = {};

  @query(".passive") private _passiveContainer!: HTMLDivElement;

  @queryAll("ha-selector-select") private _gaSelectors!: NodeListOf<HTMLElement>;

  getValidGroupAddresses(validDPTs: DPT[]): GroupAddress[] {
    return this.knx.project?.project_loaded
      ? Object.values(this.knx.project.knxproject.group_addresses).filter((groupAddress) =>
          groupAddress.dpt ? isValidDPT(groupAddress.dpt, validDPTs) : false,
        )
      : [];
  }

  getDptOptionByValue(value: string | undefined): DPTOption | undefined {
    return value ? this.options.dptSelect?.find((dpt) => dpt.value === value) : undefined;
  }

  setFilteredGroupAddresses = memoize((dpt: DPT | undefined) => {
    this.filteredGroupAddresses = dpt
      ? this.getValidGroupAddresses([dpt])
      : this.validGroupAddresses;
    this.addressOptions = getAddressOptions(this.filteredGroupAddresses);
  });

  connectedCallback() {
    super.connectedCallback();
    this.validGroupAddresses = this.getValidGroupAddresses(
      this.options.validDPTs ?? this.options.dptSelect?.map((dptOption) => dptOption.dpt) ?? [],
    );
    this.filteredGroupAddresses = this.validGroupAddresses;
    this.addressOptions = getAddressOptions(this.filteredGroupAddresses);
  }

  protected shouldUpdate(changedProps: PropertyValues<this>) {
    // ignore hass updates to avoid scrolling reset of open dropdowns (when input filter is set)
    return !(changedProps.size === 1 && changedProps.has("hass"));
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("config")) {
      this._selectedDPTValue = this.config.dpt ?? this._selectedDPTValue;
      const selectedDPT = this.getDptOptionByValue(this._selectedDPTValue)?.dpt;
      this.setFilteredGroupAddresses(selectedDPT);

      if (selectedDPT && this.knx.project?.project_loaded) {
        const allDpts = [
          this.config.write,
          this.config.state,
          ...(this.config.passive ?? []),
        ].filter((ga) => ga != null);
        this.dptSelectorDisabled =
          allDpts.length > 0 &&
          allDpts.every((ga) => {
            const _dpt = this.knx.project?.knxproject.group_addresses[ga!]?.dpt;
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
      const firstError = getValidationError(this.validationErrors, selector.key);
      // only ha-selector-select with custom_value or multiple have comboBox
      selector.comboBox.errorMessage = firstError?.error_message;
      selector.comboBox.invalid = !!firstError;
    });
  }

  render() {
    const alwaysShowPassive = this.config.passive && this.config.passive.length > 0;

    const validGADropTargetClass = this._validGADropTarget === true;
    const invalidGADropTargetClass = this._validGADropTarget === false;

    const generalValidationError = getValidationError(this.validationErrors);

    return html`
      ${generalValidationError
        ? html`<p class="error">
            <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
            <b>Validation error:</b>
            ${generalValidationError.error_message}
          </p>`
        : nothing}
      <div class="main">
        <div class="selectors">
          ${this.options.write
            ? html`<ha-selector-select
                class=${classMap({
                  "valid-drop-zone": validGADropTargetClass,
                  "invalid-drop-zone": invalidGADropTargetClass,
                })}
                .hass=${this.hass}
                .label=${"Send address" + (this.label ? ` - ${this.label}` : "")}
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
                .label=${"State address" + (this.label ? ` - ${this.label}` : "")}
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
          .label=${"Passive addresses" + (this.label ? ` - ${this.label}` : "")}
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
      ${this.options.dptSelect ? this._renderDptSelector() : nothing}
    `;
  }

  private _renderDptSelector() {
    const invalid = getValidationError(this.validationErrors, "dpt");
    return html`<knx-dpt-selector
      .key=${"dpt"}
      .label=${"Datapoint type"}
      .options=${this.options.dptSelect}
      .value=${this._selectedDPTValue}
      .disabled=${this.dptSelectorDisabled}
      .invalid=${!!invalid}
      .invalidMessage=${invalid?.error_message}
      @value-changed=${this._updateConfig}
    >
    </knx-dpt-selector>`;
  }

  private _updateConfig(ev: CustomEvent) {
    ev.stopPropagation();
    const target = ev.target as any;
    const value = ev.detail.value;
    const newConfig = { ...this.config, [target.key]: value };
    const hasGroupAddresses = !!(newConfig.write || newConfig.state || newConfig.passive?.length);

    this._updateDptSelector(target.key, newConfig, hasGroupAddresses);
    this.config = newConfig;

    const newValue = hasGroupAddresses ? newConfig : undefined;
    fireEvent(this, "value-changed", { value: newValue });
    this.requestUpdate();
  }

  private _updateDptSelector(targetKey: string, newConfig: GASchema, hasGroupAddresses: boolean) {
    // updates newConfig in place
    if (!this.options.dptSelect) return;

    if (targetKey === "dpt") {
      this._selectedDPTValue = newConfig.dpt;
    } else if (!hasGroupAddresses) {
      // when all GAs have actively been cleared, reset dpt field
      newConfig.dpt = undefined;
      this._selectedDPTValue = undefined;
      return;
    } else {
      newConfig.dpt = this._selectedDPTValue;
    }

    // below only applies to loaded projects as it inferes DPT from selected group address
    if (!this.knx.project?.project_loaded) return;

    const newGa = this._getAddedGroupAddress(targetKey, newConfig);
    if (!newGa || this._selectedDPTValue !== undefined) return;

    const newDpt = this.validGroupAddresses.find((ga) => ga.address === newGa)?.dpt;
    if (!newDpt) return;

    const exactDptMatch = this.options.dptSelect.find(
      (dptOption) => dptOption.dpt.main === newDpt.main && dptOption.dpt.sub === newDpt.sub,
    );
    newConfig.dpt = exactDptMatch
      ? exactDptMatch.value
      : // fallback to first valid DPT if allowed in options; otherwise undefined
        this.options.dptSelect.find((dptOption) => isValidDPT(newDpt, [dptOption.dpt]))?.value;
  }

  private _getAddedGroupAddress(targetKey: string, newConfig: GASchema): string | undefined {
    if (targetKey === "write" || targetKey === "state") {
      return newConfig[targetKey];
    }
    if (targetKey === "passive") {
      // for passive ignore removals, only use additions
      return newConfig.passive?.find((ga) => !this.config.passive?.includes(ga));
    }
    return undefined;
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

    .error {
      color: var(--error-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-group-address-selector": GroupAddressSelector;
  }
}
