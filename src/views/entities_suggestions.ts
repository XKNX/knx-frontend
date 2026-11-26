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
import { createAreaRegistryEntry } from "@ha/data/area/area_registry";
import { updateEntityRegistryEntry } from "@ha/data/entity/entity_registry";
import { createFloorRegistryEntry } from "@ha/data/floor_registry";
import type { HomeAssistant, Route } from "@ha/types";

import "../components/knx-sticky-expansion-panel";
import { createEntity, getEntitySuggestions, validateEntity } from "services/websocket.service";
import type { EntityData, SupportedPlatform } from "types/entity_data";

import { showKnxProjectUploadDialog } from "../dialogs/show-knx-project-upload-dialog";
import { knxProjectContext } from "../data/knx-project-context";
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
import {
  findRegistryIdByName,
  getProjectAreas,
  normalizeRegistryName,
  suggestionArea,
  type ProjectArea,
  type ProjectAreas,
  type ProjectFloor,
} from "../utils/project-areas";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";
import type { EntitySuggestion, EntitySuggestionsResult, KNXProject } from "../types/websocket";

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
  // the entity was created, but could not be assigned to its area
  areaErrorMessage?: string;
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

  @consume({ context: knxProjectContext, subscribe: true })
  @state()
  private _projectData: KNXProject | null = null;

  // assign created entities to areas derived from the ETS building structure
  @state() private _assignAreas = false;

  // remove sort numbers like "05. " from the names of floors and areas
  @state() private _stripSortNumbers = false;

  private _projectAreasCache?: {
    project: KNXProject;
    stripSortNumbers: boolean;
    areas: ProjectAreas;
  };

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

  /** Floors and areas of the ETS building structure - undefined while there is none. */
  private _projectAreas(): ProjectAreas | undefined {
    const project = this._projectData;
    if (!project?.locations || !Object.keys(project.locations).length) return undefined;
    const stripSortNumbers = this._stripSortNumbers;
    if (
      this._projectAreasCache?.project !== project ||
      this._projectAreasCache.stripSortNumbers !== stripSortNumbers
    ) {
      this._projectAreasCache = {
        project,
        stripSortNumbers,
        areas: getProjectAreas(project.locations, { stripSortNumbers }),
      };
    }
    return this._projectAreasCache.areas;
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
      ${repeat(
        suggestionsByProvider(suggestions),
        // the panel owns its expansion - the key keeps it with its provider
        (provider) => provider.providerId,
        (provider) => this._renderProviderSuggestions(provider),
      )}
      <div class="footer">
        ${this._renderAssignAreasSwitch()}
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

  private _renderAssignAreasSwitch(): TemplateResult | typeof nothing {
    if (!this._projectAreas()) return nothing;
    return html`
      <div class="area-options">
        <ha-switch
          .checked=${this._assignAreas}
          .disabled=${this._creating}
          @change=${this._assignAreasChanged}
          >${this.knx.localize("suggestions_assign_areas")}</ha-switch
        >
        ${
          this._assignAreas
            ? html`<ha-switch
                .checked=${this._stripSortNumbers}
                .disabled=${this._creating}
                @change=${this._stripSortNumbersChanged}
                >${this.knx.localize("suggestions_strip_sort_numbers")}</ha-switch
              >`
            : nothing
        }
      </div>
    `;
  }

  /** The suggestions of one source - a group of one source never mixes with another's. */
  private _renderProviderSuggestions(provider: ProviderSuggestions): TemplateResult {
    const count = provider.groups.reduce((sum, group) => sum + group.suggestions.length, 0);
    return html`
      <knx-sticky-expansion-panel
        expanded
        class="provider-panel"
        data-provider-id=${provider.providerId}
      >
        <div slot="header" class="provider-heading">
          <span class="provider-title">${this._providerName(provider.providerId)}</span>
          <span class="provider-count">
            ${this.knx.localize("suggestions_provider_count", { count })}
          </span>
        </div>
        <div class="provider-groups">
          ${provider.groups.map((group) => this._renderGroup(group))}
        </div>
      </knx-sticky-expansion-panel>
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
      <ha-card outlined class="device-card">
        <div class="card-header">
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
                ></ha-checkbox>`
              : nothing
          }
          <span>${title}</span>
        </div>
        ${groupSuggestions.map((suggestion) => this._renderRow(suggestion))}
      </ha-card>
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
    const areaInfo = this._areaInfo(suggestion);
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
          ${areaInfo ? html`<div class="row-secondary">${areaInfo}</div>` : nothing}
          ${
            rowState.status === "error"
              ? html`<ha-alert alert-type="error">${rowState.errorMessage}</ha-alert>`
              : nothing
          }
          ${
            rowState.areaErrorMessage
              ? html`<ha-alert alert-type="warning">${rowState.areaErrorMessage}</ha-alert>`
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

  /** The area an entity created from this suggestion is assigned to. */
  private _areaInfo(suggestion: EntitySuggestion): string | undefined {
    const projectAreas = this._assignAreas ? this._projectAreas() : undefined;
    if (!projectAreas) return undefined;
    const area = suggestionArea(suggestion, projectAreas);
    if (!area) return this.knx.localize("ui.panel.config.integrations.config_entry.no_area");
    return this.knx.localize("ui.panel.config.integrations.config_entry.area", {
      area: area.floor ? `${area.name} (${area.floor.name})` : area.name,
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

  private _assignAreasChanged = (ev: Event) => {
    this._assignAreas = (ev.target as HTMLInputElement).checked;
  };

  private _stripSortNumbersChanged = (ev: Event) => {
    this._stripSortNumbers = (ev.target as HTMLInputElement).checked;
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
    const projectAreas = this._assignAreas ? this._projectAreas() : undefined;
    // ids of floors and areas by normalized name - including those created in this run,
    // which `hass.floors` and `hass.areas` may not list yet
    const registryIds = { floors: new Map<string, string>(), areas: new Map<string, string>() };
    this._creating = true;
    try {
      if (projectAreas) {
        await this._ensureFloorsInOrder(suggestions, projectAreas, registryIds.floors);
      }
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
          const area = projectAreas && suggestionArea(suggestion, projectAreas);
          if (area && result.entity_id) {
            try {
              // eslint-disable-next-line no-await-in-loop
              const areaId = await this._ensureArea(area, registryIds);
              // eslint-disable-next-line no-await-in-loop
              await updateEntityRegistryEntry(this.hass.callWS, result.entity_id, {
                area_id: areaId,
              });
            } catch (err) {
              logger.error("Error assigning area", err);
              this._updateRowState(suggestion, {
                areaErrorMessage: this.knx.localize("suggestions_area_error", {
                  area: area.name,
                  error: `${(err as { message?: string })?.message ?? err}`,
                }),
              });
            }
          }
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

  /**
   * The id of the area of the given name - created on its floor, and the floor
   * created too, if there is none of that name yet. An existing area is kept as is.
   */
  private async _ensureArea(
    area: ProjectArea,
    registryIds: { floors: Map<string, string>; areas: Map<string, string> },
  ): Promise<string> {
    const areaKey = normalizeRegistryName(area.name);
    const knownAreaId =
      registryIds.areas.get(areaKey) ?? findRegistryIdByName(this.hass.areas, area.name);
    if (knownAreaId) {
      registryIds.areas.set(areaKey, knownAreaId);
      return knownAreaId;
    }
    const floorId = area.floor
      ? await this._ensureFloor(area.floor, registryIds.floors)
      : undefined;
    const created = await createAreaRegistryEntry(this.hass, {
      name: area.name,
      ...(floorId ? { floor_id: floorId } : {}),
    });
    registryIds.areas.set(areaKey, created.area_id);
    return created.area_id;
  }

  /** The id of the floor of the given name - created if there is none of that name yet. */
  private async _ensureFloor(floor: ProjectFloor, floorIds: Map<string, string>): Promise<string> {
    const floorKey = normalizeRegistryName(floor.name);
    const floorId =
      floorIds.get(floorKey) ??
      findRegistryIdByName(this.hass.floors, floor.name) ??
      (await createFloorRegistryEntry(this.hass.callWS, { name: floor.name })).floor_id;
    floorIds.set(floorKey, floorId);
    return floorId;
  }

  /**
   * New floors are listed in the order they are created - the floors of the
   * selected suggestions are created up front, in the order of the ETS building
   * structure, instead of the order their first entity is created in.
   * Their level is left unset: the ETS has no notion of the ground floor.
   */
  private async _ensureFloorsInOrder(
    suggestions: EntitySuggestion[],
    projectAreas: ProjectAreas,
    floorIds: Map<string, string>,
  ) {
    const floors = new Set<ProjectFloor>();
    suggestions.forEach((suggestion) => {
      const rowState = this._rowState(suggestion);
      if (!rowState.selected || rowState.status === "created") return;
      const area = suggestionArea(suggestion, projectAreas);
      // an existing area is kept on its floor - its floor of the ETS isn't needed
      if (area?.floor && !findRegistryIdByName(this.hass.areas, area.name)) {
        floors.add(area.floor);
      }
    });
    for (const floor of [...floors].sort((a, b) => a.order - b.order)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this._ensureFloor(floor, floorIds);
      } catch (err) {
        // retried with the first area on this floor - which reports the error
        logger.error("Error creating floor", err);
      }
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

    knx-sticky-expansion-panel.provider-panel {
      margin-bottom: 16px;
      --sticky-expansion-panel-header-padding: 4px 16px 4px 8px;
      --sticky-expansion-panel-content-padding: 0;
    }

    /* the cards of the groups stand out against the tinted body of the panel,
       its header keeps the card color */
    .provider-groups {
      padding: 16px 16px 0;
      background-color: var(--primary-background-color);
      /* the margin of the last card stays inside the tinted area */
      display: flow-root;
    }

    .provider-heading {
      display: flex;
      flex: 1;
      align-items: baseline;
      gap: 12px;
      min-width: 0;
    }

    .provider-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--ha-font-size-l, 16px);
      font-weight: var(--ha-font-weight-medium, 500);
    }

    .provider-count {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      white-space: nowrap;
    }

    .content > ha-alert {
      margin: 0 0 16px;

      & ha-button {
        white-space: nowrap;
      }
    }

    .device-card .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
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
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--ha-space-4, 16px);
    }
    /* the options of the entities to create - stacked, apart from the button */
    .area-options {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-2, 8px);
      margin-inline-end: auto;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-entities-suggestions": KNXEntitiesSuggestions;
  }
}
