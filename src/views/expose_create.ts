import { mdiDelete, mdiFileDocumentEdit, mdiPlus, mdiFloppy } from "@mdi/js";
import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { consume } from "@lit/context";
import { customElement, property, state, query } from "lit/decorators";
import { Task } from "@lit/task";

import type { HassEntities, HassEntity } from "home-assistant-js-websocket";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-alert";
import "@ha/components/ha-button";
import "@ha/components/ha-card";
import "@ha/components/ha-adaptive-dialog";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-textarea";
import "@ha/components/ha-fab";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-switch";
import "@ha/components/entity/ha-entity-picker";
import "@ha/components/entity/ha-entity-attribute-picker";

import { transform } from "@ha/common/decorators/transform";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { navigate } from "@ha/common/navigate";
import { throttle } from "@ha/common/util/throttle";
import type { HomeAssistant, Route } from "@ha/types";
import { statesContext } from "@ha/data/context";

import "../components/knx-expose-template-preview";
import "../components/knx-group-address-selector";
import "../components/knx-selector-row";

import { updateExpose, getExposeConfig, validateExposeConfig } from "services/websocket.service";
import type {
  ExposeOption,
  ExposeConfigData,
  ExposeResult,
  ErrorDescription,
} from "types/entity_data";
import {
  exposeGroupsContext,
  type ExposeGroupsContextValue,
} from "../data/knx-expose-groups-context";
import type { KnxHaSelector, GASelectorOptions } from "../types/schema";
import { setNestedValue } from "../utils/config-helper";
import { extractValidationErrors, getValidationError } from "../utils/validation";

import { knxProjectContext } from "../data/knx-project-context";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";
import type { KNXProject } from "../types/websocket";

const logger = new KNXLogger("knx-create-expose");

const GA_SELECTOR_OPTIONS: GASelectorOptions = {
  write: { required: true },
  dptClasses: ["numeric", "enum", "string", "complex"],
};

const DEFAULT_SELECTOR: KnxHaSelector = {
  type: "ha_selector",
  name: "default",
  selector: { object: {} },
};

const VALUE_TEMPLATE_SELECTOR: KnxHaSelector = {
  type: "ha_selector",
  name: "value_template",
  placeholder: "{# example: invert a percent attribute #}\n{{ 100 - value }}",
  selector: { template: { preview: false } },
};

const COOLDOWN_SELECTOR: KnxHaSelector = {
  type: "ha_selector",
  name: "cooldown",
  selector: {
    duration: { allow_negative: false, enable_millisecond: true, enable_day: false },
  },
};

const PERIODIC_SEND_SELECTOR: KnxHaSelector = {
  type: "ha_selector",
  name: "periodic_send",
  selector: {
    duration: { allow_negative: false, enable_millisecond: true, enable_day: false },
  },
};

const RESPOND_TO_READ_SELECTOR: KnxHaSelector = {
  type: "ha_selector",
  name: "respond_to_read",
  default: true,
  selector: { boolean: {} },
};

const HIDDEN_ATTRIBUTES = new Set([
  "attribution",
  "hidden",
  "id",
  "icon",
  "options",
  "supported_features",
  "unit_of_measurement",
  "state_class",
  "device_class",
  "friendly_name",
  "supported_color_modes",
  "min_color_temp_kelvin",
  "max_color_temp_kelvin",
  "hvac_modes",
  "preset_modes",
]);

@customElement("knx-create-expose")
export class KNXCreateExpose extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @state() private _entityId?: string;

  @state() private _config: ExposeConfigData = { options: [{ ga: {} }] };

  @state() private _validationErrors?: ErrorDescription[];

  @state() private _validationBaseError?: string;

  @state() private _showRawValues = false;

  @state() private _showNotesDialog = false;

  @state()
  @consume({ context: knxProjectContext, subscribe: true })
  private _projectData: KNXProject | null = null;

  @state()
  @consume({ context: statesContext, subscribe: true })
  @transform({
    transformer: function (this: KNXCreateExpose, entityStates: HassEntities) {
      return this._entityId ? entityStates?.[this._entityId] : undefined;
    },
    watch: ["_entityId"],
  })
  private _stateObj?: HassEntity;

  @consume({ context: exposeGroupsContext, subscribe: false })
  private _exposeGroupsCtx: ExposeGroupsContextValue | null = null;

  @query("ha-alert") private _alertElement?: HTMLElement;

  private _intent?: "create" | "edit";

  private _configLoadTask = new Task(this, {
    args: () => [this._entityId] as const,
    task: async ([entityId]) => {
      if (!entityId) return;
      this._config = await getExposeConfig(this.hass, entityId);

      const urlParams = new URLSearchParams(mainWindow.location.search);
      const copyFrom = urlParams.get("copy");
      if (copyFrom && copyFrom !== entityId) {
        const copyConfig = await getExposeConfig(this.hass, copyFrom);
        logger.debug("Copying expose options from", copyFrom, copyConfig);
        this._config = copyConfig;
      }
      if (this._config.options.length === 0) {
        this._config = { ...this._config, options: [{ ga: {} }] };
      }
      this._validationErrors = undefined;
      this._validationBaseError = undefined;
    },
  });

  private _backendLocalize = (key: string) =>
    this.hass.localize(`component.knx.config_panel.expose.create.${key}`);

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("route")) {
      const intent = this.route.prefix.split("/").slice(-1)[0];
      if (intent === "create" || intent === "edit") {
        this._intent = intent;
      } else {
        logger.error("Unknown intent", intent);
        this._intent = undefined;
        return;
      }

      // parse entity_id from path for both create and edit
      // e.g. /knx/expose/create/light.living_room -> path: "/light.living_room"
      const entityId = this.route.path.split("/")[1] || undefined;
      if (entityId !== this._entityId) {
        this._entityId = entityId;
        this._config = { options: [{ ga: {} }] };
        this._validationErrors = undefined;
        this._validationBaseError = undefined;
      }
    }
  }

  protected render(): TemplateResult {
    if (!this._intent) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }
    return this._renderContent();
  }

  private _renderConfigTask() {
    if (!this._entityId) return nothing;
    return this._configLoadTask.render({
      initial: () => nothing,
      pending: () => nothing,
      error: (err) => {
        logger.error("Error loading expose config", err);
        return html`<ha-alert alert-type="error"
          >${this.knx.localize("expose_create_load_error")}</ha-alert
        >`;
      },
      complete: () => {
        const baseErrors = extractValidationErrors(this._validationErrors, "data");
        return html`
          ${this._config.options.map((option, idx) =>
            this._renderExposeOption(option, idx, baseErrors),
          )}
          <div class="add-button-row">
            <ha-button @click=${this._addExpose}>
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${this.hass.localize("component.knx.config_panel.expose.create.add_expose")}
            </ha-button>
          </div>
        `;
      },
    });
  }

  private _renderContent(): TemplateResult {
    if (!this._entityId) {
      return this._renderEntityPicker();
    }
    return this._renderConfig();
  }

  private _renderEntityPicker(): TemplateResult {
    const urlParams = new URLSearchParams(mainWindow.location.search);
    const copyFrom = urlParams.get("copy");

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .backPath=${"/knx/expose/view"}
        .header=${this.hass.localize("component.knx.config_panel.expose.create.title")}
      >
        <div class="content">
          <ha-card outlined>
            <div class="card-content">
              <ha-entity-picker
                .hass=${this.hass}
                .label=${this.hass.localize(
                  "component.knx.config_panel.expose.create.entity.title",
                )}
                .helper=${this.hass.localize(
                  "component.knx.config_panel.expose.create.entity.description",
                )}
                .value=${""}
                required
                @value-changed=${this._entityChanged}
              ></ha-entity-picker>
            </div>
          </ha-card>
          ${copyFrom
            ? html` <ha-alert alert-type="info">
                ${this.hass.localize("component.knx.config_panel.expose.create.copy_info", {
                  entity_name: this.hass.states[copyFrom]?.attributes.friendly_name ?? "?",
                  entity_id: copyFrom,
                })}
              </ha-alert>`
            : nothing}
        </div>
      </hass-subpage>
    `;
  }

  private _renderConfig(): TemplateResult {
    const create = this._intent === "create";
    const backPath = create ? "/knx/expose/create" : this.backPath;

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .backPath=${backPath}
        .header=${create
          ? this.hass.localize("component.knx.config_panel.expose.create.title")
          : `${this.hass.localize("ui.common.edit")}: ${this._entityId}`}
      >
        ${this.narrow ? this._renderNotesDialog() : nothing}
        <div class="content config-layout ${this.narrow ? "" : "wide"}">
          <div class="entity-column">
            <div class="entity-info-sticky">${this._renderEntityInfo()}</div>
            ${!this.narrow ? this._renderNotesCard() : nothing}
          </div>
          <div class="config-column">
            ${this._renderConfigTask()}
            ${this._validationBaseError
              ? html`
                  <ha-alert alert-type="error">
                    <details>
                      <summary><b>${this.knx.localize("expose_validation_error")}</b></summary>
                      <p>${this._validationBaseError}</p>
                      ${this._validationErrors?.map(
                        (err) =>
                          html`<p>
                            ${err.error_class}: ${err.error_message}
                            ${err.path ? "in " + err.path.join(" / ") : ""}
                          </p>`,
                      ) ?? nothing}
                    </details>
                  </ha-alert>
                `
              : nothing}
          </div>
        </div>
        <ha-fab
          slot="fab"
          .label=${create
            ? this.hass.localize("ui.common.create")
            : this.hass.localize("ui.common.save")}
          extended
          @click=${this._save}
          ?disabled=${this._config.options.some((e) => !e.ga?.write)}
        >
          <ha-svg-icon slot="icon" .path=${create ? mdiPlus : mdiFloppy}></ha-svg-icon>
        </ha-fab>
        ${this.narrow && this._entityId
          ? html`
              <ha-fab
                class="notes-fab"
                .label=${this.hass.localize("component.knx.config_panel.expose.create.notes.label")}
                extended
                @click=${this._openNotesDialog}
              >
                <ha-svg-icon slot="icon" .path=${mdiFileDocumentEdit}></ha-svg-icon>
              </ha-fab>
            `
          : nothing}
      </hass-subpage>
    `;
  }

  private _renderEntityInfo(): TemplateResult | typeof nothing {
    if (!this._stateObj) return nothing;
    const stateObj = this._stateObj;
    const name = stateObj.attributes.friendly_name ?? this._entityId!;
    const visibleAttrs = Object.keys(stateObj.attributes).filter(
      (attr) => !HIDDEN_ATTRIBUTES.has(attr),
    );
    return html`
      <ha-card outlined>
        <div class="entity-info">
          <div class="entity-info-header">
            <div class="entity-info-title">
              <ha-state-icon
                class="entity-icon"
                .hass=${this.hass}
                .stateObj=${stateObj}
              ></ha-state-icon>
              <div class="entity-info-text">
                <div class="entity-name">${name}</div>
                <div class="entity-id">${this._entityId}</div>
              </div>
            </div>
            <div class="raw-toggle-row">
              <span class="raw-toggle-label"
                >${this.hass.localize(
                  "component.knx.config_panel.expose.create.show_raw_values",
                )}</span
              >
              <ha-switch
                .checked=${this._showRawValues}
                @change=${this._showRawValuesChanged}
              ></ha-switch>
            </div>
          </div>
          <div class="entity-attrs">
            <div class="entity-attr">
              <span class="attr-name"
                >${this.hass.localize("ui.components.selectors.selector.types.state")}</span
              >
              <span class="attr-value"
                >${this._showRawValues
                  ? this._toRawValueString(stateObj.state)
                  : this.hass.formatEntityState(stateObj)}</span
              >
            </div>
            ${visibleAttrs.map(
              (attr) => html`
                <div class="entity-attr">
                  <span class="attr-name"
                    >${this.hass.formatEntityAttributeName(stateObj, attr)}</span
                  >
                  <span class="attr-value"
                    >${this._showRawValues
                      ? this._toRawValueString(stateObj.attributes[attr])
                      : this.hass.formatEntityAttributeValue(stateObj, attr)}</span
                  >
                </div>
              `,
            )}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _showRawValuesChanged(ev: Event) {
    this._showRawValues = (ev.currentTarget as HTMLInputElement).checked;
  }

  private _renderNotesCard(): TemplateResult {
    return html`
      <ha-card outlined class="notes-card">
        <div class="card-header">
          ${this.hass.localize("component.knx.config_panel.expose.create.notes.label")}
        </div>
        <div class="card-content">
          <ha-textarea
            .placeholder=${this.hass.localize(
              "component.knx.config_panel.expose.create.notes.placeholder",
            )}
            .rows=${this._getNotesRows()}
            .value=${this._config.notes ?? ""}
            @input=${this._updateNotes}
          ></ha-textarea>
        </div>
      </ha-card>
    `;
  }

  private _renderNotesDialog(): TemplateResult {
    return html`
      <ha-adaptive-dialog
        .hass=${this.hass}
        .open=${this._showNotesDialog}
        @closed=${this._closeNotesDialog}
        .headerTitle=${this.hass.localize("component.knx.config_panel.expose.create.notes.label")}
      >
        <ha-textarea
          .rows=${this._getNotesRows()}
          class="notes-textarea-dialog"
          .placeholder=${this.hass.localize(
            "component.knx.config_panel.expose.create.notes.placeholder",
          )}
          .value=${this._config.notes ?? ""}
          @input=${this._updateNotes}
        ></ha-textarea>
      </ha-adaptive-dialog>
    `;
  }

  private _getNotesRows(): number {
    const notes = this._config.notes ?? "";
    const newlineCount = (notes.match(/\n/g) ?? []).length;
    const softWrapLines = Math.ceil(notes.length / 100);
    return Math.max(4, newlineCount + softWrapLines + 1);
  }

  private _updateNotes(ev: Event) {
    const textarea = ev.currentTarget as { value?: string } | null;
    const value = textarea?.value ?? "";
    const config = { ...this._config };
    setNestedValue(config, "notes", value || undefined, logger);
    this._config = config as ExposeConfigData;
  }

  private _openNotesDialog() {
    this._showNotesDialog = true;
  }

  private _closeNotesDialog() {
    this._showNotesDialog = false;
  }

  private _toRawValueString(value: unknown): string {
    if (value === null) return "None";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private _renderExposeOption(
    option: ExposeOption,
    idx: number,
    errors?: ErrorDescription[],
  ): TemplateResult {
    const optionErrors = this._getExposeOptionValidationErrorsForIndex(errors, idx);
    const optionError = getValidationError(optionErrors);
    const attributeError = getValidationError(optionErrors, "attribute");
    const gaErrors = extractValidationErrors(optionErrors, "ga");
    const title = this._stateObj
      ? option.attribute
        ? this.hass.formatEntityAttributeName(this._stateObj, option.attribute)
        : this.hass.localize("ui.components.selectors.selector.types.state")
      : "";
    const gaName = option.ga?.write
      ? (this._projectData?.group_addresses[option.ga.write]?.name ?? option.ga.write)
      : "";
    return html`
      <ha-expansion-panel outlined expanded left-chevron .header=${title} .secondary=${gaName}>
        ${this._config.options.length > 1
          ? html`
              <ha-icon-button
                slot="icons"
                data-idx=${idx}
                .path=${mdiDelete}
                .label=${this.hass.localize("ui.common.delete")}
                @click=${this._removeExpose}
              ></ha-icon-button>
            `
          : nothing}
        <div class="panel-content">
          ${optionError
            ? html` <ha-alert alert-type="error">${optionError.error_message}</ha-alert> `
            : nothing}
          <ha-entity-attribute-picker
            data-idx=${idx}
            allow-custom-value
            .hass=${this.hass}
            .key=${"attribute"}
            .entityId=${this._entityId}
            .value=${option.attribute ?? ""}
            .label=${this.hass.localize("ui.components.selectors.selector.types.attribute")}
            .helper=${this.hass.localize(
              "component.knx.config_panel.expose.create.attribute.description",
            )}
            .hideAttributes=${[...HIDDEN_ATTRIBUTES]}
            @value-changed=${this._updateExposeOptionAtIndex}
          ></ha-entity-attribute-picker>
          ${attributeError
            ? html` <ha-alert alert-type="error">${attributeError.error_message}</ha-alert> `
            : nothing}
          <knx-group-address-selector
            data-idx=${idx}
            .knx=${this.knx}
            .key=${"ga"}
            .options=${GA_SELECTOR_OPTIONS}
            .config=${option.ga ?? {}}
            .label=${this.hass.localize("component.knx.config_panel.expose.create.ga.label")}
            .localizeFunction=${this._backendLocalize}
            .validationErrors=${gaErrors}
            @value-changed=${this._updateExposeOptionAtIndex}
          ></knx-group-address-selector>
          <ha-expansion-panel
            .header=${this.hass.localize(
              "component.knx.config_panel.expose.create.section_advanced_options.title",
            )}
          >
            <knx-selector-row
              data-idx=${idx}
              .hass=${this.hass}
              .key=${"default"}
              .selector=${DEFAULT_SELECTOR}
              .value=${option.default ?? undefined}
              .validationErrors=${extractValidationErrors(optionErrors, "default")}
              .localizeFunction=${this._backendLocalize}
              @value-changed=${this._updateExposeOptionAtIndex}
            ></knx-selector-row>
            <knx-selector-row
              data-idx=${idx}
              .hass=${this.hass}
              .key=${"value_template"}
              .selector=${VALUE_TEMPLATE_SELECTOR}
              .value=${option.value_template}
              .validationErrors=${extractValidationErrors(optionErrors, "value_template")}
              .localizeFunction=${this._backendLocalize}
              @value-changed=${this._updateExposeOptionAtIndex}
            >
              <knx-expose-template-preview
                .entityId=${this._entityId ?? ""}
                .attribute=${option.attribute}
                .valueTemplate=${option.value_template}
              ></knx-expose-template-preview>
            </knx-selector-row>
            <knx-selector-row
              data-idx=${idx}
              .hass=${this.hass}
              .key=${"cooldown"}
              .selector=${COOLDOWN_SELECTOR}
              .value=${option.cooldown}
              .validationErrors=${extractValidationErrors(optionErrors, "cooldown")}
              .localizeFunction=${this._backendLocalize}
              @value-changed=${this._updateExposeOptionAtIndex}
            ></knx-selector-row>
            <knx-selector-row
              data-idx=${idx}
              .hass=${this.hass}
              .key=${"periodic_send"}
              .selector=${PERIODIC_SEND_SELECTOR}
              .value=${option.periodic_send}
              .validationErrors=${extractValidationErrors(optionErrors, "periodic_send")}
              .localizeFunction=${this._backendLocalize}
              @value-changed=${this._updateExposeOptionAtIndex}
            ></knx-selector-row>
            <knx-selector-row
              data-idx=${idx}
              .hass=${this.hass}
              .key=${"respond_to_read"}
              .selector=${RESPOND_TO_READ_SELECTOR}
              .value=${option.respond_to_read}
              .validationErrors=${extractValidationErrors(optionErrors, "respond_to_read")}
              .localizeFunction=${this._backendLocalize}
              @value-changed=${this._updateExposeOptionAtIndex}
            ></knx-selector-row>
          </ha-expansion-panel>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _getExposeOptionValidationErrorsForIndex(
    errors: ErrorDescription[] | undefined,
    idx: number,
  ): ErrorDescription[] | undefined {
    const optionErrors = extractValidationErrors(errors, "options");
    return optionErrors ? extractValidationErrors(optionErrors, String(idx)) : undefined;
  }

  private _entityChanged(ev: CustomEvent) {
    const entityId = (ev.detail.value as string) || undefined;
    if (entityId) {
      navigate(`/knx/expose/create/${entityId}${mainWindow.location.search}`);
    }
  }

  private _addExpose() {
    this._config = { ...this._config, options: [...this._config.options, { ga: {} }] };
  }

  private _removeExpose(ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    const idx = parseInt((ev.currentTarget as HTMLElement).dataset.idx ?? "0");
    this._config = { ...this._config, options: this._config.options.filter((_, i) => i !== idx) };
    if (this._validationErrors) this._validate();
  }

  private _updateExposeOptionAtIndex(ev: CustomEvent<{ value: unknown }>) {
    const target = ev.currentTarget as HTMLElement & { key?: string; selector?: KnxHaSelector };
    const idx = parseInt(target.dataset.idx ?? "0");
    const key = target.key;
    if (!key) return;
    const newOptions = [...this._config.options];
    const nextItem: Record<string, any> = {
      ...newOptions[idx],
      ga: { ...(newOptions[idx].ga ?? {}) },
    };
    let value = ev.detail.value ?? undefined;
    if (
      value !== undefined &&
      typeof target.selector?.selector === "object" &&
      "duration" in target.selector.selector
    ) {
      const duration = value as {
        hours?: number;
        minutes?: number;
        seconds?: number;
        milliseconds?: number;
      };
      // convert duration object to seconds for storage
      value =
        (duration.hours ?? 0) * 3600 +
        (duration.minutes ?? 0) * 60 +
        (duration.seconds ?? 0) +
        (duration.milliseconds ?? 0) / 1000;
    }
    setNestedValue(nextItem, key, value, logger);
    newOptions[idx] = nextItem as ExposeOption;
    this._config = { ...this._config, options: newOptions };
    logger.debug("Updated expose item", idx, key, value, "new config:", this._config);
    if (this._validationErrors) this._validate();
  }

  private _validate = throttle(() => {
    if (!this._entityId) return;
    validateExposeConfig(this.hass, this._entityId, this._config)
      .then((result) => this._handleResult(result, false))
      .catch((err) => {
        logger.error("validateExposeConfig", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }, 250);

  private async _save(ev: Event) {
    ev.stopPropagation();
    if (!this._entityId) return;
    try {
      logger.debug("Saving expose config", this._config);
      const result = await updateExpose(this.hass, this._entityId, this._config);
      if (this._handleResult(result, true)) return;
      logger.debug("Successfully saved expose", this._entityId);
      this._exposeGroupsCtx?.reload();
      navigate("/knx/expose", { replace: true });
    } catch (err) {
      logger.error("Error saving expose", err);
      navigate("/knx/error", { replace: true, data: err });
    }
  }

  private _handleResult(result: ExposeResult, final: boolean): boolean {
    if (!result.success) {
      logger.warn("Validation error", result);
      this._validationErrors = result.errors;
      this._validationBaseError = result.error_base;
      if (final) {
        setTimeout(() => this._alertElement?.scrollIntoView({ behavior: "smooth" }));
      }
      return true;
    }
    this._validationErrors = undefined;
    this._validationBaseError = undefined;
    return false;
  }

  static styles = css`
    hass-loading-screen {
      --app-header-background-color: var(--sidebar-background-color);
      --app-header-text-color: var(--sidebar-text-color);
    }

    ha-expansion-panel {
      margin-bottom: 16px;

      > :first-child {
        /* between header and collapsible container */
        margin-top: 16px;
      }
    }
    ha-expansion-panel > knx-selector-row:first-child {
      border: 0;
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 720px;
      margin: 20px auto 80px; /* leave space for fab */
      padding: 0 16px;
    }

    .config-layout.wide {
      display: grid;
      grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
      max-width: 1200px;
      align-items: start;
      gap: 16px;
    }

    .entity-column {
      min-width: 0;
    }

    .config-column {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .config-layout.wide .entity-column {
    }

    .config-layout.wide .entity-info-sticky {
      position: sticky;
      top: 16px;
    }

    .panel-content {
      padding: 0 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .entity-info {
      padding: 16px;
    }

    .entity-info-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }

    .entity-info-title {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      min-width: 0;
    }

    .entity-info-text {
      min-width: 0;
    }

    .entity-icon {
      margin-top: 2px;
    }

    .entity-name {
      font-size: 1.1rem;
      font-weight: 500;
    }

    .entity-id {
      font-size: 0.85rem;
      color: var(--secondary-text-color);
      margin-bottom: 12px;
    }

    .raw-toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }

    .raw-toggle-label {
      font-size: 0.85rem;
      color: var(--secondary-text-color);
    }

    .entity-attrs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 16px;
    }

    .entity-attr {
      display: contents;
    }

    .attr-name {
      font-size: 0.9rem;
      color: var(--secondary-text-color);
    }

    .attr-value {
      font-size: 0.9rem;
      text-align: end;
    }

    .add-button-row {
      display: flex;
      justify-content: center;
    }

    .notes-fab {
      position: fixed;
      left: max(16px, var(--safe-area-inset-left));
      bottom: calc(16px + var(--safe-area-inset-bottom));
      z-index: 6;
      --mdc-theme-secondary: var(--state-inactive-color) !important;
    }

    ha-alert {
      display: block;

      & summary {
        padding: 10px;
      }
    }

    ha-card .card-content ha-textarea {
      display: block;
      width: 100%;
    }

    .notes-textarea-dialog {
      display: block;
      width: 100%;
      max-height: 75vh;
    }

    .notes-card {
      margin-top: 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-create-expose": KNXCreateExpose;
  }
}
