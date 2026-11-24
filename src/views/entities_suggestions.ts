import { mdiAlertCircle, mdiCheckCircle, mdiOpenInNew, mdiPlus } from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "@lit/context";
import { Task } from "@lit/task";
import { repeat } from "lit/directives/repeat";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-alert";
import "@ha/components/ha-button";
import "@ha/components/ha-card";
import "@ha/components/ha-checkbox";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-label";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-spinner";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-switch";
import "@ha/components/input/ha-input";
import { navigate } from "@ha/common/navigate";
import type { HomeAssistant, Route } from "@ha/types";

import "../components/knx-sticky-expansion-panel";
import { createEntity, getEntitySuggestions, validateEntity } from "services/websocket.service";
import type { EntityData, SupportedPlatform } from "types/entity_data";

import { showKnxProjectUploadDialog } from "../dialogs/show-knx-project-upload-dialog";
import {
  entitiesByGroupContext,
  type EntitiesByGroupContextValue,
} from "../data/knx-entities-by-group-context";
import type { LocalKnxKey } from "../localize/localize";
import { getPlatformStyle } from "../utils/common";
import { exitFlow } from "../utils/navigation";
import {
  projectReimportSuggested,
  suggestionProviders,
  suggestionsByProvider,
  type ProviderSuggestions,
  type SuggestionGroup,
  type SuggestionProviderInfo,
} from "../utils/entity-suggestions";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";
import type { EntitySuggestion, EntitySuggestionsResult } from "../types/websocket";

const logger = new KNXLogger("knx-entities-suggestions");

// providers not listed here are shown by their id
const PROVIDER_TEXTS: Record<string, { name: LocalKnxKey; description: LocalKnxKey }> = {
  fb: {
    name: "suggestions_provider_fb_name",
    description: "suggestions_provider_fb_description",
  },
  // added by https://github.com/home-assistant/core/pull/192342 - backends without it don't report it
  fn: {
    name: "suggestions_provider_fn_name",
    description: "suggestions_provider_fn_description",
  },
  cfg: {
    name: "suggestions_provider_cfg_name",
    description: "suggestions_provider_cfg_description",
  },
};

// providers grouping by something else than a device: its id is no individual
// address but an internal identifier (`fn`: the space of a function) - not shown
const PROVIDER_GROUPS: Record<string, { selectAll: LocalKnxKey }> = {
  fn: { selectAll: "suggestions_select_all_space" },
};

interface RowState {
  selected: boolean;
  name: string;
  platform: SupportedPlatform;
  status: "idle" | "creating" | "created" | "error";
  errorMessage?: string;
}

@customElement("knx-entities-suggestions")
export class KNXEntitiesSuggestions extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route?: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @consume({ context: entitiesByGroupContext, subscribe: false })
  private _entitiesByGroupCtx?: EntitiesByGroupContextValue | null;

  @state() private _rowStates: Record<string, RowState> = {};

  @state() private _creating = false;

  // ids of providers whose suggestions are filtered out
  @state() private _hiddenProviders: ReadonlySet<string> = new Set();

  private _suggestionsTask = new Task(this, {
    // generated anew when another project file was imported
    args: () => [this.knx.projectInfo] as const,
    task: () => getEntitySuggestions(this.hass),
  });

  private _rowState(suggestion: EntitySuggestion): RowState {
    return (
      this._rowStates[suggestion.id] ?? {
        selected: !suggestion.existing_entity_ids.length,
        name: suggestion.suggested_name,
        platform: suggestion.platform_options[0],
        status: "idle",
      }
    );
  }

  /** Suggestions of the providers that are not filtered out. */
  private _visibleSuggestions(): EntitySuggestion[] {
    return (this._suggestionsTask.value?.suggestions ?? []).filter(
      (suggestion) => !this._hiddenProviders.has(suggestion.source),
    );
  }

  private _updateRowState(suggestion: EntitySuggestion, update: Partial<RowState>) {
    this._rowStates = {
      ...this._rowStates,
      [suggestion.id]: { ...this._rowState(suggestion), ...update },
    };
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .backPath=${this.backPath}
        .backCallback=${this._exitSuggestions}
      >
        <span slot="header" class="header">
          ${this.knx.localize("suggestions_title")}
          <ha-label dense class="beta">${this.knx.localize("suggestions_beta")}</ha-label>
        </span>
        <div class="content">
          ${this._suggestionsTask.render({
            initial: () => html`<hass-loading-screen no-toolbar></hass-loading-screen>`,
            pending: () => html`<hass-loading-screen no-toolbar></hass-loading-screen>`,
            error: (err) => this._renderInfo(`${err}`),
            complete: (result) => this._renderResult(result),
          })}
        </div>
      </hass-subpage>
    `;
  }

  private _renderInfo(text: string, action?: TemplateResult): TemplateResult {
    return html`
      <ha-card outlined class="info-card">
        <div class="card-content">${text}</div>
        ${action ? html`<div class="card-actions">${action}</div>` : nothing}
      </ha-card>
    `;
  }

  private _renderResult(result: EntitySuggestionsResult): TemplateResult {
    const providers = suggestionProviders(result);
    if (providers.some((provider) => provider.hints?.state === "no_project")) {
      return this._renderInfo(
        this.knx.localize("suggestions_no_project"),
        this._renderProjectUploadButton(),
      );
    }
    return html`
      ${this._renderReimportNote()}${this._renderProviders(providers)}${this._renderSuggestions()}
    `;
  }

  /** Newer parser versions export more of what suggestions are derived from. */
  private _renderReimportNote(): TemplateResult | typeof nothing {
    const version = this.knx.projectInfo?.xknxproject_version;
    if (!projectReimportSuggested(version)) return nothing;
    return html`
      <ha-alert alert-type="info">
        ${this.knx.localize("suggestions_reimport_project", { version: version ?? "?" })}
        <ha-button slot="action" appearance="plain" @click=${this._openProjectUploadDialog}>
          ${this.knx.localize("component.knx.config_panel.dialogs.project_upload.title")}
        </ha-button>
      </ha-alert>
    `;
  }

  /** Every source of suggestions - what it does and what it has to offer. */
  private _renderProviders(providers: SuggestionProviderInfo[]): TemplateResult {
    // filtering is only of use if there is more than one source to choose from
    const filterable = providers.filter((provider) => provider.count).length > 1;
    return html`
      <ha-card outlined .header=${this.knx.localize("suggestions_providers_title")}>
        ${providers.map((provider) => this._renderProvider(provider, filterable))}
      </ha-card>
    `;
  }

  private _renderProvider(provider: SuggestionProviderInfo, filterable: boolean): TemplateResult {
    const texts = PROVIDER_TEXTS[provider.id];
    const name = this._providerName(provider.id);
    const outdatedParser = provider.hints?.state === "outdated_parser";
    return html`
      <div class="row provider">
        <div class="row-content">
          <div class="provider-name">${name}</div>
          ${
            texts
              ? html`<div class="row-secondary">${this.knx.localize(texts.description)}</div>`
              : nothing
          }
          <div class="row-secondary provider-status ${outdatedParser ? "existing" : ""}">
            ${this._providerStatus(provider)}
          </div>
        </div>
        ${
          filterable && provider.count
            ? html`<ha-switch
                data-provider-id=${provider.id}
                .checked=${!this._hiddenProviders.has(provider.id)}
                .disabled=${this._creating}
                title=${this.knx.localize("suggestions_provider_show", { provider: name })}
                aria-label=${this.knx.localize("suggestions_provider_show", { provider: name })}
                @change=${this._providerVisibilityChanged}
              ></ha-switch>`
            : nothing
        }
      </div>
    `;
  }

  private _providerName(providerId: string): string {
    const texts = PROVIDER_TEXTS[providerId];
    return texts ? this.knx.localize(texts.name) : providerId;
  }

  /** How many suggestions a provider has - or why it has none. */
  private _providerStatus(provider: SuggestionProviderInfo): string {
    if (provider.count) {
      return this.knx.localize("suggestions_provider_count", { count: provider.count });
    }
    const hints = provider.hints;
    if (provider.id === "fb") {
      switch (hints?.state) {
        case "outdated_parser":
          return this.knx.localize("suggestions_outdated_parser", {
            version: `${hints.parser_version}`,
          });
        case "no_semantics":
          return this.knx.localize("suggestions_no_semantics");
        case "ok":
          return this.knx.localize("suggestions_no_supported_blocks", {
            functional_blocks: ((hints.functional_blocks_found as string[]) ?? []).join(", "),
          });
      }
    }
    if (provider.id === "fn") {
      switch (hints?.state) {
        case "outdated_parser":
          return this.knx.localize("suggestions_outdated_parser", {
            version: `${hints.parser_version}`,
          });
        case "no_functions":
          return this.knx.localize("suggestions_no_functions");
        case "ok":
          return this.knx.localize("suggestions_no_supported_functions");
      }
    }
    if (provider.id === "cfg") {
      switch (hints?.state) {
        case "no_ui_entities":
          return this.knx.localize("suggestions_no_ui_entities");
        case "ok":
          return this.knx.localize("suggestions_no_similar_channels");
      }
    }
    return this.knx.localize("suggestions_provider_none");
  }

  private _renderProjectUploadButton(): TemplateResult {
    return html`<ha-button @click=${this._openProjectUploadDialog}>
      ${this.knx.localize("component.knx.config_panel.dialogs.project_upload.title")}
    </ha-button>`;
  }

  private _renderSuggestions(): TemplateResult | typeof nothing {
    if (!this._suggestionsTask.value?.suggestions.length) return nothing;
    const suggestions = this._visibleSuggestions();
    const selectedCount = suggestions.filter(
      (suggestion) =>
        this._rowState(suggestion).selected && this._rowState(suggestion).status !== "created",
    ).length;

    return html`
      ${suggestionsByProvider(suggestions).map((provider) => this._renderProviderSuggestions(provider))}
      <div class="footer">
        <ha-button
          size="l"
          @click=${this._createSelected}
          ?disabled=${this._creating || !selectedCount}
        >
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.knx.localize("suggestions_create_selected", { count: selectedCount })}
        </ha-button>
      </div>
    `;
  }

  /** The suggestions of one source - a group of one source never mixes with another's. */
  private _renderProviderSuggestions(provider: ProviderSuggestions): TemplateResult {
    const count = provider.groups.reduce((sum, group) => sum + group.suggestions.length, 0);
    return html`
      <section class="provider-section" data-provider-id=${provider.providerId}>
        <h2 class="provider-heading">
          <span>${this._providerName(provider.providerId)}</span>
          <span class="provider-count">
            ${this.knx.localize("suggestions_provider_count", { count })}
          </span>
        </h2>
        ${repeat(
          provider.groups,
          // the panel owns its expansion - the key keeps it with its group
          (group) => group.groupId,
          (group) => this._renderGroup(group),
        )}
      </section>
    `;
  }

  private _renderGroup(group: SuggestionGroup): TemplateResult {
    const { providerId, groupId, groupName, suggestions: groupSuggestions } = group;
    const providerGroups = PROVIDER_GROUPS[providerId];
    // created suggestions are done - there is nothing left to select
    const selectable = groupSuggestions.filter(
      (suggestion) => this._rowState(suggestion).status !== "created",
    );
    const selectedCount = selectable.filter(
      (suggestion) => this._rowState(suggestion).selected,
    ).length;
    const selectAllLabel = this.knx.localize(providerGroups?.selectAll ?? "suggestions_select_all");
    // a group without a name still needs a title - eg. a function of no room
    const title = providerGroups ? groupName || groupId : `${groupId} ${groupName}`;
    return html`
      <knx-sticky-expansion-panel expanded class="group">
        <div slot="header" class="group-header">
          ${
            groupSuggestions.length > 1
              ? html`<ha-checkbox
                  data-provider-id=${providerId}
                  data-group-id=${groupId}
                  .checked=${selectable.length > 0 && selectedCount === selectable.length}
                  .indeterminate=${selectedCount > 0 && selectedCount < selectable.length}
                  .disabled=${this._creating || !selectable.length}
                  title=${selectAllLabel}
                  aria-label=${selectAllLabel}
                  @change=${this._groupSelectedChanged}
                  @click=${this._stopPropagation}
                  @keydown=${this._stopPropagation}
                ></ha-checkbox>`
              : nothing
          }
          <span class="group-title">${title}</span>
          <span class="group-count">
            ${this.knx.localize("suggestions_provider_count", { count: groupSuggestions.length })}
          </span>
        </div>
        <div class="rows">${groupSuggestions.map((suggestion) => this._renderRow(suggestion))}</div>
      </knx-sticky-expansion-panel>
    `;
  }

  private _renderRow(suggestion: EntitySuggestion): TemplateResult {
    const rowState = this._rowState(suggestion);
    const platformSuggestion = suggestion.suggestions[rowState.platform]!;
    const platformStyle = getPlatformStyle(rowState.platform);
    const platformColor = `color: ${platformStyle.color};`;
    const done = rowState.status === "created";
    const existingEntitiesInfo = suggestion.existing_entity_ids.length
      ? this.knx.localize("suggestions_already_configured", {
          entities: suggestion.existing_entity_ids.join(", "),
        })
      : undefined;
    const templateEntityInfo = this._templateEntityInfo(suggestion);
    return html`
      <div class="row">
        <ha-checkbox
          data-suggestion-id=${suggestion.id}
          .checked=${rowState.selected && !done}
          .disabled=${this._creating || done}
          @change=${this._rowSelectedChanged}
        ></ha-checkbox>
        <div class="row-content">
          <div class="row-main">
            <ha-input
              data-suggestion-id=${suggestion.id}
              .label=${this.hass.localize("ui.common.name")}
              .value=${rowState.name}
              ?disabled=${this._creating || done}
              @change=${this._rowNameChanged}
            ></ha-input>
            ${
              suggestion.platform_options.length > 1
                ? html`
                    <ha-selector-select
                      data-suggestion-id=${suggestion.id}
                      .hass=${this.hass}
                      .label=${this.knx.localize("suggestions_platform")}
                      .disabled=${this._creating || done}
                      .selector=${this._platformSelector(suggestion)}
                      .value=${rowState.platform}
                      .required=${true}
                      @value-changed=${this._rowPlatformChanged}
                    ></ha-selector-select>
                  `
                : html`
                    <span class="platform">
                      <ha-svg-icon
                        .path=${platformStyle.iconPath}
                        style=${platformColor}
                      ></ha-svg-icon>
                      ${this._platformLabel(rowState.platform)}
                    </span>
                  `
            }
          </div>
          <div class="row-secondary">
            <span class="channel-name">${suggestion.secondary_info}</span>
            ${platformSuggestion.matched_group_addresses.map(
              (ga) => html`<span class="ga-chip" title=${ga.name}>${ga.address}</span>`,
            )}
          </div>
          ${
            templateEntityInfo
              ? html`<div class="row-secondary">${templateEntityInfo}</div>`
              : nothing
          }
          ${
            existingEntitiesInfo
              ? html`<div class="row-secondary existing">${existingEntitiesInfo}</div>`
              : nothing
          }
          ${
            rowState.status === "error"
              ? html`<ha-alert alert-type="error">${rowState.errorMessage}</ha-alert>`
              : nothing
          }
        </div>
        <div class="row-actions">
          ${rowState.status === "creating" ? html`<ha-spinner size="small"></ha-spinner>` : nothing}
          ${
            done
              ? html`<ha-svg-icon class="success" .path=${mdiCheckCircle}></ha-svg-icon>`
              : nothing
          }
          ${
            rowState.status === "error"
              ? html`<ha-svg-icon class="error" .path=${mdiAlertCircle}></ha-svg-icon>`
              : nothing
          }
          <ha-icon-button
            data-suggestion-id=${suggestion.id}
            .label=${this.knx.localize("suggestions_open_in_editor")}
            .path=${mdiOpenInNew}
            .disabled=${this._creating || done}
            @click=${this._openInEditorClicked}
          ></ha-icon-button>
        </div>
      </div>
    `;
  }

  /** The entity a suggestion copies its configuration from, if it has one. */
  private _templateEntityInfo(suggestion: EntitySuggestion): string | undefined {
    const entityId = suggestion.metadata.template_entity_id;
    if (typeof entityId !== "string") return undefined;
    return this.knx.localize("suggestions_template_entity", {
      entity: this.hass.states[entityId]?.attributes.friendly_name ?? entityId,
    });
  }

  private _platformLabel(platform: SupportedPlatform): string {
    return this.hass.localize(`component.${platform}.title`) || platform;
  }

  private _platformSelector(suggestion: EntitySuggestion) {
    return {
      select: {
        mode: "dropdown" as const,
        options: suggestion.platform_options.map((platform) => ({
          value: platform,
          label: this._platformLabel(platform),
        })),
      },
    };
  }

  private _suggestionOfEvent(ev: Event): EntitySuggestion | undefined {
    const suggestionId = (ev.currentTarget as HTMLElement).getAttribute("data-suggestion-id");
    if (!suggestionId) return undefined;
    return this._suggestionsTask.value?.suggestions.find(
      (suggestion) => suggestion.id === suggestionId,
    );
  }

  /** Using a control in a group header doesn't expand or collapse the group. */
  private _stopPropagation = (ev: Event) => {
    ev.stopPropagation();
  };

  private _rowSelectedChanged = (ev: Event) => {
    const suggestion = this._suggestionOfEvent(ev);
    if (!suggestion) return;
    this._updateRowState(suggestion, { selected: (ev.target as HTMLInputElement).checked });
  };

  private _groupSelectedChanged = (ev: Event) => {
    const target = ev.currentTarget as HTMLElement;
    const providerId = target.getAttribute("data-provider-id");
    const groupId = target.getAttribute("data-group-id");
    const selected = (ev.target as HTMLInputElement).checked;
    const rowStates = { ...this._rowStates };
    this._visibleSuggestions().forEach((suggestion) => {
      const rowState = this._rowState(suggestion);
      if (
        suggestion.source === providerId &&
        suggestion.group_id === groupId &&
        rowState.status !== "created"
      ) {
        rowStates[suggestion.id] = { ...rowState, selected };
      }
    });
    this._rowStates = rowStates;
  };

  private _providerVisibilityChanged = (ev: Event) => {
    const providerId = (ev.currentTarget as HTMLElement).getAttribute("data-provider-id");
    if (!providerId) return;
    const hiddenProviders = new Set(this._hiddenProviders);
    if ((ev.target as HTMLInputElement).checked) {
      hiddenProviders.delete(providerId);
    } else {
      hiddenProviders.add(providerId);
    }
    this._hiddenProviders = hiddenProviders;
  };

  private _rowNameChanged = (ev: Event) => {
    const suggestion = this._suggestionOfEvent(ev);
    if (!suggestion) return;
    this._updateRowState(suggestion, { name: (ev.target as HTMLInputElement).value });
  };

  private _rowPlatformChanged = (ev: CustomEvent) => {
    const suggestion = this._suggestionOfEvent(ev);
    if (!suggestion) return;
    this._updateRowState(suggestion, { platform: ev.detail.value });
  };

  private _openInEditorClicked = (ev: Event) => {
    const suggestion = this._suggestionOfEvent(ev);
    if (!suggestion) return;
    const rowState = this._rowState(suggestion);
    navigate(`/knx/entities/create/${rowState.platform}`, {
      // read from `history.state` by knx-create-entity to prefill the form
      data: { entityData: this._entityData(suggestion, rowState) },
    });
  };

  private _entityData(suggestion: EntitySuggestion, rowState: RowState): EntityData {
    return {
      entity: {
        name: rowState.name,
        device_info: null,
        entity_category: null,
      },
      knx: suggestion.suggestions[rowState.platform]!.knx,
    };
  }

  private async _createSelected() {
    // suggestions of a filtered out provider are not created
    const suggestions = this._visibleSuggestions();
    this._creating = true;
    try {
      for (const suggestion of suggestions) {
        const rowState = this._rowState(suggestion);
        if (!rowState.selected || rowState.status === "created") continue;
        this._updateRowState(suggestion, { status: "creating" });
        const createData = {
          platform: rowState.platform,
          data: this._entityData(suggestion, rowState),
        };
        try {
          // validate before creation for proper error messages
          // eslint-disable-next-line no-await-in-loop
          const validationResult = await validateEntity(this.hass, createData);
          if (validationResult.success === false) {
            this._updateRowState(suggestion, {
              status: "error",
              errorMessage: `${validationResult.error_base}: ${validationResult.errors
                .map((error) => `${error.message} in ${error.path?.join(" / ")}`)
                .join(", ")}`,
            });
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          const result = await createEntity(this.hass, createData);
          if (result.success === false) {
            this._updateRowState(suggestion, {
              status: "error",
              errorMessage: result.error_base,
            });
            continue;
          }
          logger.debug("created entity", result.entity_id, "for", suggestion.id);
          this._updateRowState(suggestion, { status: "created", selected: false });
        } catch (err) {
          logger.error("Error creating entity", err);
          this._updateRowState(suggestion, {
            status: "error",
            errorMessage: `${err}`,
          });
        }
      }
    } finally {
      this._creating = false;
      this._entitiesByGroupCtx?.reload();
    }
  }

  /** Back to where the suggestions were opened from, leaving no history entry. */
  private _exitSuggestions = () => {
    exitFlow("/knx/entities/view");
  };

  private _openProjectUploadDialog() {
    // a finished upload reloads `knx` - the suggestions follow its project info
    showKnxProjectUploadDialog(this, { hass: this.hass, knx: this.knx });
  }

  static styles = css`
    .content {
      margin: 20px auto 80px;
      max-width: 820px;
      padding: 0 16px;
    }

    .header {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    ha-label.beta {
      --ha-label-background-color: var(--primary-color);
      --ha-label-background-opacity: 0.2;
      text-transform: uppercase;
    }

    ha-card {
      display: block;
      margin-bottom: 16px;
    }

    .row.provider {
      align-items: center;
    }

    .provider-name {
      font-weight: var(--ha-font-weight-medium, 500);
    }

    .provider-section {
      margin-top: 24px;
    }

    .provider-heading {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 12px;
      margin: 0 0 8px;
      padding: 0 16px;
      font-size: var(--ha-font-size-l, 16px);
      font-weight: var(--ha-font-weight-medium, 500);
    }

    .provider-count {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      font-weight: var(--ha-font-weight-normal, 400);
    }

    .content > ha-alert {
      margin: 0 0 16px;

      & ha-button {
        white-space: nowrap;
      }
    }

    knx-sticky-expansion-panel.group {
      margin-bottom: 8px;
      --sticky-expansion-panel-header-padding: 4px 16px 4px 8px;
      --sticky-expansion-panel-content-padding: 0;
    }

    .group-header {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .group-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--ha-font-size-l, 16px);
    }

    .group-count {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      white-space: nowrap;
    }

    /* the header of the group draws the divider above its first row */
    .rows > .row:first-child {
      border-top: none;
    }

    .info-card .card-content {
      color: var(--secondary-text-color);
    }

    .card-actions {
      padding: 0 8px 8px;
    }

    .row {
      display: flex;
      align-items: flex-start;
      padding: 8px 16px;
      border-top: 1px solid var(--divider-color);
      gap: 8px;
    }

    .row-content {
      flex-grow: 1;
      min-width: 0;
    }

    .row-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;

      & ha-input {
        flex-grow: 1;
        min-width: 200px;
      }

      & ha-selector-select {
        min-width: 140px;
      }
    }

    .platform {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }

    .row-secondary {
      margin-top: 4px;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
    }

    .row-secondary.existing {
      color: var(--warning-color);
    }

    .ga-chip {
      background-color: var(--secondary-background-color);
      border-radius: 10px;
      padding: 1px 8px;
      font-family: var(--ha-font-family-code, monospace);
    }

    .row-actions {
      display: flex;
      align-items: center;
      gap: 4px;

      & .success {
        color: var(--success-color);
      }

      & .error {
        color: var(--error-color);
      }
    }

    ha-alert {
      display: block;
      margin-top: 8px;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-entities-suggestions": KNXEntitiesSuggestions;
  }
}
