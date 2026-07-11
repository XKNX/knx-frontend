import { mdiAlertCircle, mdiCheckCircle, mdiOpenInNew, mdiPlus } from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "@lit/context";
import { Task } from "@lit/task";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-alert";
import "@ha/components/ha-button";
import "@ha/components/ha-card";
import "@ha/components/ha-checkbox";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-spinner";
import "@ha/components/ha-svg-icon";
import "@ha/components/input/ha-input";
import { navigate } from "@ha/common/navigate";
import type { HomeAssistant, Route } from "@ha/types";

import { createEntity, getEntitySuggestions, validateEntity } from "services/websocket.service";
import type { EntityData, SupportedPlatform } from "types/entity_data";

import {
  entitiesByGroupContext,
  type EntitiesByGroupContextValue,
} from "../data/knx-entities-by-group-context";
import { getPlatformStyle } from "../utils/common";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";
import type { EntitySuggestion, FunctionalBlockProviderHints } from "../types/websocket";

const logger = new KNXLogger("knx-entities-suggestions");

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

  private _suggestionsTask = new Task(this, {
    args: () => [] as const,
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
        .back-path=${this.backPath}
        .header=${this.knx.localize("suggestions_title")}
      >
        <div class="content">
          ${this._suggestionsTask.render({
            initial: () => html`<hass-loading-screen no-toolbar></hass-loading-screen>`,
            pending: () => html`<hass-loading-screen no-toolbar></hass-loading-screen>`,
            error: (err) => this._renderInfo(`${err}`),
            complete: (result) => this._renderResult(result.suggestions, result.providers),
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

  private _renderResult(
    suggestions: EntitySuggestion[],
    providers: { fb: FunctionalBlockProviderHints },
  ): TemplateResult {
    const hints = providers.fb;
    if (hints.state === "no_project") {
      return this._renderInfo(
        this.knx.localize("suggestions_no_project"),
        html`<ha-button @click=${this._navigateInfo}>
          ${this.knx.localize("suggestions_open_info_view")}
        </ha-button>`,
      );
    }
    if (hints.state === "outdated_parser") {
      return this._renderInfo(
        this.knx.localize("suggestions_outdated_parser", {
          version: hints.parser_version,
        }),
        html`<ha-button @click=${this._navigateInfo}>
          ${this.knx.localize("suggestions_open_info_view")}
        </ha-button>`,
      );
    }
    if (hints.state === "no_semantics") {
      return this._renderInfo(this.knx.localize("suggestions_no_semantics"));
    }
    if (!suggestions.length) {
      return this._renderInfo(
        this.knx.localize("suggestions_no_supported_blocks", {
          functional_blocks: (hints.functional_blocks_found ?? []).join(", "),
        }),
      );
    }
    return this._renderSuggestions(suggestions);
  }

  private _renderSuggestions(suggestions: EntitySuggestion[]): TemplateResult {
    const groups = new Map<string, EntitySuggestion[]>();
    suggestions.forEach((suggestion) => {
      const groupSuggestions = groups.get(suggestion.group_id) ?? [];
      groupSuggestions.push(suggestion);
      groups.set(suggestion.group_id, groupSuggestions);
    });
    const selectedCount = suggestions.filter(
      (suggestion) =>
        this._rowState(suggestion).selected && this._rowState(suggestion).status !== "created",
    ).length;

    return html`
      ${[...groups.values()].map(
        (groupSuggestions) => html`
          <ha-card
            outlined
            .header=${`${groupSuggestions[0].group_id} ${groupSuggestions[0].group_name}`}
            class="device-card"
          >
            ${groupSuggestions.map((suggestion) => this._renderRow(suggestion))}
          </ha-card>
        `,
      )}
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
    const suggestions = this._suggestionsTask.value?.suggestions;
    if (!suggestions) return;
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

  private _navigateInfo() {
    navigate("/knx/info");
  }

  static styles = css`
    .content {
      margin: 20px auto 80px;
      max-width: 820px;
      padding: 0 16px;
    }

    ha-card {
      display: block;
      margin-bottom: 16px;
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
