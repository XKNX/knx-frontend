import { mdiAlertCircleOutline, mdiClose } from "@mdi/js";
import type { TemplateResult, PropertyValues, HTMLTemplateResult } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "@lit/context";
import memoize from "memoize-one";

import "@ha/components/ha-icon-button";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import "./knx-dpt-option-selector";
import "./knx-dpt-dialog-selector";
import "./knx-single-address-selector";
import type { DragDropContext } from "../utils/drag-drop-context";
import { dragDropContext } from "../utils/drag-drop-context";
import { isValidDPT, dptToString, stringToDpt } from "../utils/dpt";
import { getValidationError, extractValidationErrors } from "../utils/validation";
import type { ErrorDescription, GASchema } from "../types/entity_data";
import type { KNX } from "../types/knx";
import type { GASelectorOptions } from "../types/schema";
import type { DPT, GroupAddress } from "../types/websocket";

@customElement("knx-group-address-selector")
export class GroupAddressSelector extends LitElement {
  @consume({ context: dragDropContext, subscribe: true }) _dragDropContext?: DragDropContext;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property() public label?: string;

  @property({ attribute: false }) public config: GASchema = {};

  @property({ attribute: false }) public options!: GASelectorOptions;

  @property({ reflect: true }) public key!: string;

  @property({ attribute: false }) public required?: boolean;

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  @property({ attribute: false }) public localizeFunction: (value: string) => string = (
    key: string,
  ) => key;

  @state() private _showEmptyPassiveField = false;

  private _selectedDPTValue?: string;

  // all group addresses that are valid according to the accepted DPTs
  validGroupAddresses: GroupAddress[] = [];

  // group addresses filtered by selected DPT
  filteredGroupAddresses: GroupAddress[] = [];

  dptSelectorDisabled = false;

  private _validGADropTarget?: boolean;

  private _dragOverTimeout: Record<string, NodeJS.Timeout> = {};

  // also used in knx-single-address-selector and knx-dpt-dialog-selector
  private _baseTranslation = (
    key: string,
    values?: Record<string, string | number | HTMLTemplateResult | null | undefined>,
  ) =>
    this.hass.localize(
      `component.knx.config_panel.entities.create._.knx.knx_group_address.${key}`,
      values,
    );

  private _getAcceptedDPTs(): DPT[] {
    // we have multiple ways to specify accepted DPTs - only one is used at a time
    const fromValid = this.options.validDPTs;
    const fromClasses = this.options.dptClasses
      ? this._getDPTsFromClasses(this.options.dptClasses)
      : undefined;
    const fromSelect = this.options.dptSelect?.map((o) => o.dpt);
    return fromValid ?? fromClasses ?? fromSelect ?? [];
  }

  getValidGroupAddresses(validDPTs: DPT[]): GroupAddress[] {
    return this.knx.projectData
      ? Object.values(this.knx.projectData.group_addresses).filter((groupAddress) =>
          groupAddress.dpt ? isValidDPT(groupAddress.dpt, validDPTs) : false,
        )
      : [];
  }

  getDptByValue(value: string | undefined): DPT | undefined {
    if (!value) return undefined;
    if (this.options.dptSelect) {
      return this.options.dptSelect?.find((dpt) => dpt.value === value)?.dpt;
    }
    if (this.options.dptClasses) {
      return stringToDpt(value) ?? undefined;
    }
    return undefined;
  }

  setFilteredGroupAddresses = memoize((dpt: DPT | undefined) => {
    this.filteredGroupAddresses = dpt
      ? this.getValidGroupAddresses([dpt])
      : this.validGroupAddresses;
  });

  protected shouldUpdate(changedProps: PropertyValues<this>) {
    // ignore hass updates - we shouldn't need to re-render on those
    return !(changedProps.size === 1 && changedProps.has("hass"));
  }

  private _getDPTsFromClasses = memoize((dptClasses?: string[]): DPT[] => {
    if (!dptClasses?.length || !this.knx.dptMetadata) return [];
    const classes = new Set(dptClasses);
    return Object.values(this.knx.dptMetadata)
      .filter((meta) => classes.has(meta.dpt_class))
      .map((meta) => ({ main: meta.main, sub: meta.sub }));
  });

  private _getDptStringsFromClasses = memoize((dptClasses?: string[]): string[] =>
    this._getDPTsFromClasses(dptClasses).map(dptToString),
  );

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("options")) {
      // initialize
      this.validGroupAddresses = this.getValidGroupAddresses(this._getAcceptedDPTs());
      this.filteredGroupAddresses = this.validGroupAddresses;
    }

    if (changedProps.has("config")) {
      this._selectedDPTValue = this.config.dpt ?? this._selectedDPTValue;
      const selectedDPT = this.getDptByValue(this._selectedDPTValue);
      this.setFilteredGroupAddresses(selectedDPT);

      if (selectedDPT && this.knx.projectData) {
        const allDpts = [
          this.config.write,
          this.config.state,
          ...(this.config.passive ?? []),
        ].filter((ga) => !!ga);
        this.dptSelectorDisabled =
          allDpts.length > 0 &&
          allDpts.every((ga) => {
            const _dpt = this.knx.projectData!.group_addresses[ga!]?.dpt;
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

  protected render(): TemplateResult {
    const validGADropTargetClass = this._validGADropTarget === true;
    const invalidGADropTargetClass = this._validGADropTarget === false;

    const generalValidationError = getValidationError(this.validationErrors);
    const gaDescription = this.localizeFunction(this.key + ".description");
    const requiredLabel = this.required
      ? this.hass.localize("ui.common.error_required")
      : undefined;

    return html`
      <p class="title">${this.label}</p>
      ${requiredLabel ? html`<p class="description">${requiredLabel}</p>` : nothing}
      ${gaDescription ? html`<p class="description">${gaDescription}</p>` : nothing}
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
            ? html`<knx-single-address-selector
                class=${classMap({
                  "valid-drop-zone": validGADropTargetClass,
                  "invalid-drop-zone": invalidGADropTargetClass,
                })}
                .hass=${this.hass}
                .knx=${this.knx}
                .label=${this._baseTranslation("send_address")}
                .parentLabel=${this.label}
                .required=${this.options.write.required}
                .groupAddresses=${this.filteredGroupAddresses}
                .key=${"write"}
                .value=${this.config.write ?? undefined}
                .invalidMessage=${getValidationError(this.validationErrors, "write")?.error_message}
                .hintMessage=${this._isGaDptMismatch(this.config.write)
                  ? this._dptMismatchMessage(this.config.write)
                  : undefined}
                @value-changed=${this._valueChanged}
                @dragover=${this._dragOverHandler}
                @drop=${this._dropHandler}
              ></knx-single-address-selector>`
            : nothing}
          ${this.options.state
            ? html`<knx-single-address-selector
                class=${classMap({
                  "valid-drop-zone": validGADropTargetClass,
                  "invalid-drop-zone": invalidGADropTargetClass,
                })}
                .hass=${this.hass}
                .knx=${this.knx}
                .label=${this._baseTranslation("state_address")}
                .parentLabel=${this.label}
                .required=${this.options.state.required}
                .groupAddresses=${this.filteredGroupAddresses}
                .key=${"state"}
                .value=${this.config.state ?? undefined}
                .invalidMessage=${getValidationError(this.validationErrors, "state")?.error_message}
                .hintMessage=${this._isGaDptMismatch(this.config.state)
                  ? this._dptMismatchMessage(this.config.state)
                  : undefined}
                @value-changed=${this._valueChanged}
                @dragover=${this._dragOverHandler}
                @drop=${this._dropHandler}
              ></knx-single-address-selector>`
            : nothing}
        </div>
      </div>
      ${this.options.passive
        ? html`<div class="passive-list">
            ${[
              ...(this.config.passive ?? []),
              ...(this._showEmptyPassiveField ? [undefined] : []),
            ].map((ga, index) => {
              const passiveErr = this._getPassiveValidationForIndex(index);
              return html`<div class="passive-row">
                <knx-single-address-selector
                  class=${classMap({
                    "valid-drop-zone": validGADropTargetClass,
                    "invalid-drop-zone": invalidGADropTargetClass,
                  })}
                  .hass=${this.hass}
                  .knx=${this.knx}
                  .label=${this._baseTranslation("passive_address")}
                  .parentLabel=${this.label}
                  .required=${false}
                  .groupAddresses=${this.filteredGroupAddresses}
                  .key=${"passive"}
                  .index=${index}
                  .value=${ga ?? undefined}
                  .invalidMessage=${passiveErr?.error_message}
                  .hintMessage=${this._isGaDptMismatch(ga)
                    ? this._dptMismatchMessage(ga)
                    : undefined}
                  @value-changed=${this._valueChangedPassive}
                  @dragover=${this._dragOverHandler}
                  @drop=${this._dropHandler}
                ></knx-single-address-selector>
                <ha-icon-button
                  class="remove-passive"
                  .path=${mdiClose}
                  .label=${this.hass.localize("ui.common.remove")}
                  data-index=${index}
                  @click=${this._onRemovePassiveClick}
                ></ha-icon-button>
              </div>`;
            })}
          </div>`
        : nothing}
      ${this.options.validDPTs || this.options.passive
        ? html`<div class="footer-row">
            ${this.options.validDPTs
              ? html`<p class="valid-dpts">
                  ${this._baseTranslation("valid_dpts")}:
                  ${this.options.validDPTs.map((dpt) => dptToString(dpt)).join(", ")}
                </p>`
              : nothing}
            ${this.options.passive
              ? html`<a
                  href="#"
                  @click=${this._addPassiveSelector}
                  class="add-passive-link"
                  ?disabled=${this._showEmptyPassiveField}
                >
                  ${this._baseTranslation("add_passive_address")}
                </a>`
              : nothing}
          </div>`
        : nothing}
      ${this.options.dptSelect ? this._renderDptOptionSelector() : nothing}
      ${this.options.dptClasses ? this._renderDptDialogSelector() : nothing}
    `;
  }

  private _renderDptOptionSelector() {
    const invalid = getValidationError(this.validationErrors, "dpt");
    return html`<knx-dpt-option-selector
      .key=${"dpt"}
      .label=${this._baseTranslation("dpt")}
      .options=${this.options.dptSelect!}
      .value=${this._selectedDPTValue}
      .disabled=${this.dptSelectorDisabled}
      .invalid=${!!invalid}
      .invalidMessage=${invalid?.error_message}
      .localizeValue=${this.localizeFunction}
      .translation_key=${this.key}
      @value-changed=${this._valueChanged}
    >
    </knx-dpt-option-selector>`;
  }

  private _renderDptDialogSelector() {
    const invalid = getValidationError(this.validationErrors, "dpt");
    return html`<knx-dpt-dialog-selector
      .key=${"dpt"}
      .hass=${this.hass}
      .knx=${this.knx}
      .parentLabel=${this.label}
      .validDPTs=${this._getDptStringsFromClasses(this.options.dptClasses)}
      .value=${this._selectedDPTValue}
      .disabled=${this.dptSelectorDisabled}
      .invalid=${!!invalid}
      .invalidMessage=${invalid?.error_message}
      .translation_key=${this.key}
      @value-changed=${this._valueChanged}
    >
    </knx-dpt-dialog-selector>`;
  }

  private _valueChanged(ev: CustomEvent) {
    ev.stopPropagation();
    const target = ev.target as any;
    const value = ev.detail.value;
    const newConfig = { ...this.config, [target.key]: value };
    this._updateConfig(newConfig, target.key);
  }

  private _updateConfig(newConfig: GASchema, changedKey: string) {
    const hasGroupAddresses = [newConfig.write, newConfig.state, ...(newConfig.passive ?? [])].some(
      (ga) => !!ga,
    );
    this._updateDptSelector(changedKey, newConfig, hasGroupAddresses);
    this.config = newConfig;

    const newValue = hasGroupAddresses ? newConfig : undefined;
    fireEvent(this, "value-changed", { value: newValue });
    this.requestUpdate();
  }

  private _updateDptSelector(targetKey: string, newConfig: GASchema, hasGroupAddresses: boolean) {
    // updates newConfig in place
    if (!this.options.dptSelect && !this.options.dptClasses) return;

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
    if (!this.knx.projectData) return;

    const newGa = this._getAddedGroupAddress(targetKey, newConfig);
    if (!newGa || this._selectedDPTValue !== undefined) return;

    const newDpt = this.validGroupAddresses.find((ga) => ga.address === newGa)?.dpt;
    if (!newDpt) return;

    if (this.options.dptSelect) {
      const exactDptMatch = this.options.dptSelect.find(
        (dptOption) => dptOption.dpt.main === newDpt.main && dptOption.dpt.sub === newDpt.sub,
      );
      newConfig.dpt = exactDptMatch
        ? exactDptMatch.value
        : // fallback to first valid DPT if allowed in options; otherwise undefined
          this.options.dptSelect.find((dptOption) => isValidDPT(newDpt, [dptOption.dpt]))?.value;
    } else if (this.options.dptClasses) {
      const stringDpt = dptToString(newDpt);
      const validDPTsFromClasses = this._getDptStringsFromClasses(this.options.dptClasses);
      newConfig.dpt = validDPTsFromClasses.includes(stringDpt) ? stringDpt : undefined;
    }
  }

  private _getAddedGroupAddress(targetKey: string, newConfig: GASchema): string | null | undefined {
    if (targetKey === "write" || targetKey === "state") {
      return newConfig[targetKey];
    }
    if (targetKey === "passive") {
      // for passive ignore removals, only use additions
      return newConfig.passive?.find((ga) => !!ga && !this.config.passive?.includes(ga));
    }
    return undefined;
  }

  private _isGaDptMismatch(ga?: string | null): boolean {
    if (!ga || !this.knx.projectData) return false;

    const selectedGA = this.knx.projectData.group_addresses[ga];
    if (!selectedGA) return false; // unknown GA
    return !this.filteredGroupAddresses.find((groupAddress) => groupAddress === selectedGA);
  }

  private _dptMismatchMessage(ga?: string | null): string | undefined {
    if (!ga || !this.knx.projectData) return undefined;
    const dpt = dptToString(this.knx.projectData.group_addresses[ga]?.dpt) ?? "?";
    return this._baseTranslation("dpt_incompatible", { dpt });
  }

  private _addPassiveSelector = (ev?: Event) => {
    if (ev) ev.preventDefault();
    // Only allow adding if no empty field is currently shown
    if (this._showEmptyPassiveField) {
      return;
    }
    this._showEmptyPassiveField = true;
    this.requestUpdate();
  };

  private _onRemovePassiveClick = (ev: Event) => {
    const index = parseInt(
      (ev.currentTarget as HTMLElement).getAttribute("data-index") || "-1",
      10,
    );
    if (index >= 0) {
      this._removePassiveSelector(index);
    }
  };

  private _removePassiveSelector = (index: number) => {
    const committedLen = this.config.passive?.length ?? 0;

    if (index < committedLen) {
      // Remove from committed entries
      const newConfig = { ...this.config };
      const newPassive = [...(newConfig.passive ?? [])];
      newPassive.splice(index, 1);
      if (newPassive.length === 0) {
        delete newConfig.passive;
      } else {
        newConfig.passive = newPassive;
      }
      this._updateConfig(newConfig, "passive");
    } else {
      // This is the empty field - just hide it
      this._showEmptyPassiveField = false;
      this.requestUpdate();
    }
  };

  private _valueChangedPassive = (ev: CustomEvent) => {
    ev.stopPropagation();
    const target = ev.target as any;
    const index = target.index as number;
    const value = ev.detail.value as string | undefined;
    this._updatePassiveAtIndex(index, value);
  };

  private _updatePassiveAtIndex = (index: number, value: string | undefined) => {
    const committedLen = this.config.passive?.length ?? 0;

    const newConfig = { ...this.config };
    if (index < committedLen) {
      // Update existing committed entry
      const newPassive = [...(newConfig.passive ?? [])];
      newPassive[index] = value;
      newConfig.passive = newPassive.filter((ga) => !!ga);
      if (newConfig.passive.length === 0) {
        delete newConfig.passive;
      }
      if (index === committedLen - 1 && !value) {
        // if last committed entry was cleared, show empty field
        this._showEmptyPassiveField = true;
      }
    } else if (value) {
      // This is the empty field - commit value
      newConfig.passive = [...(newConfig.passive ?? []), value];
      // it's not empty anymore - prevent spawning a new empty field
      this._showEmptyPassiveField = false;
    } else {
      // empty value on empty field - do nothing
      return;
    }
    this._updateConfig(newConfig, "passive");
  };

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

  private _getPassiveValidationForIndex(index: number): ErrorDescription | undefined {
    const errors = extractValidationErrors(this.validationErrors, "passive");
    if (!errors) return undefined;
    // Prefer index-specific error if provided (path like ["index"]) otherwise general passive error
    const indexStr = String(index);
    const specific = errors.find((e) => Array.isArray(e.path) && e.path[0] === indexStr);
    return specific ?? getValidationError(errors);
  }

  private _dropHandler(ev: DragEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    const ga = ev.dataTransfer.getData("text/group-address");
    if (!ga) {
      return;
    }
    const target = ev.target as any;
    if (target.key === "passive" && typeof target.index === "number") {
      this._updatePassiveAtIndex(target.index, ga);
      return;
    }
    const newConfig = { ...this.config };
    newConfig[target.key] = ga;
    this._updateConfig(newConfig, target.key);
  }

  static styles = css`
    .main {
      display: flex;
      flex-direction: row;
    }

    .selectors {
      flex: 1;
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

    .passive-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .passive-row knx-single-address-selector {
      flex: 1 1 auto;
    }

    .title {
      margin-bottom: 12px;
    }
    .description {
      margin-top: -10px;
      margin-bottom: 12px;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }

    .footer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-top: -8px;
      margin-bottom: 12px;
      margin-left: 16px;
      margin-right: 0;
    }

    .valid-dpts {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      flex: 1 1 auto;
    }

    .add-passive-link {
      color: var(--primary-color);
      text-decoration: none;
      font-size: var(--ha-font-size-s);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: background-color 200ms;
      margin-left: auto;
    }

    .add-passive-link:not([disabled]):hover {
      background-color: rgba(var(--rgb-primary-color), 0.1);
      text-decoration: underline;
    }

    .add-passive-link[disabled] {
      color: var(--disabled-text-color);
      opacity: 0.5;
      cursor: default;
    }

    knx-dpt-dialog-selector,
    knx-dpt-option-selector {
      display: block;
      margin-top: -12px; /* move towards footer-row when validDPTs isn't shown */
    }

    knx-single-address-selector {
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
