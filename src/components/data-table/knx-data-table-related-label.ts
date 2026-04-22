import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume, type ContextType } from "@lit/context";
import { repeat } from "lit/directives/repeat";
import type { HassEntity } from "home-assistant-js-websocket";

import "@ha/components/chips/ha-chip-set";
import "@ha/components/ha-dropdown";
import "@ha/components/ha-dropdown-item";
import "@ha/components/ha-label";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";

import { navigate } from "@ha/common/navigate";
import { localizeContext } from "@ha/data/context";
import { stopPropagation } from "@ha/common/dom/stop_propagation";
import type { HomeAssistant } from "@ha/types";

import { entitiesTab, exposeTab } from "../../knx-router";

@customElement("knx-data-table-related-label")
class KnxDataTableRelatedLabel extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public entities: string[] = [];

  @property({ attribute: false }) public entitiesYaml: string[] = [];

  @property({ attribute: false }) public exposes: string[] = [];

  @state()
  @consume({ context: localizeContext, subscribe: true })
  private localize!: ContextType<typeof localizeContext>;

  protected render(): TemplateResult | typeof nothing {
    const totalItems = this.entities.length + this.entitiesYaml.length + this.exposes.length;
    if (!totalItems) {
      return nothing;
    }

    if (totalItems <= 2) {
      return html`
        <ha-chip-set>
          ${repeat(
            this.entities,
            (itemId) => itemId,
            (itemId) => this._renderEntityItem(itemId),
          )}
          ${repeat(
            this.entitiesYaml,
            (itemId) => itemId,
            (itemId) => this._renderEntityYamlItem(itemId),
          )}
          ${repeat(
            this.exposes,
            (itemId) => itemId,
            (itemId) => this._renderExposeItem(itemId),
          )}
        </ha-chip-set>
      `;
    }

    return html`
      <ha-chip-set>
        ${this._renderItemSection("entities")} ${this._renderItemSection("exposes")}
      </ha-chip-set>
    `;
  }

  private _renderItemSection(sectionType: "entities" | "exposes"): TemplateResult | typeof nothing {
    const itemCount =
      sectionType === "entities"
        ? this.entities.length + this.entitiesYaml.length
        : this.exposes.length;
    if (!itemCount) {
      return nothing;
    }

    if (itemCount === 1) {
      return sectionType === "entities"
        ? this.entities.length === 1
          ? this._renderEntityItem(this.entities[0])
          : this._renderEntityYamlItem(this.entitiesYaml[0])
        : this._renderExposeItem(this.exposes[0]);
    }

    const openDropdownLabel =
      sectionType === "entities"
        ? this.localize("ui.components.target-picker.selected.entity", { count: itemCount })
        : this.localize("component.knx.config_panel.common.exposes_count", { count: itemCount });

    return html`
      <ha-dropdown role="button" tabindex="0" @click=${stopPropagation}>
        <ha-label slot="trigger" class="open-menu" dense>${openDropdownLabel}</ha-label>
        ${repeat(
          sectionType === "entities" ? this.entities : this.exposes,
          (itemId) => itemId,
          (itemId) =>
            html`<ha-dropdown-item .value=${itemId}>
              ${sectionType === "entities"
                ? this._renderEntityItem(itemId)
                : this._renderExposeItem(itemId)}
            </ha-dropdown-item>`,
        )}
        ${sectionType === "entities" && this.entitiesYaml.length
          ? repeat(
              this.entitiesYaml,
              (itemId) => itemId,
              (itemId) =>
                html`<ha-dropdown-item .value=${itemId}>
                  ${this._renderEntityYamlItem(itemId)}
                </ha-dropdown-item>`,
            )
          : nothing}
      </ha-dropdown>
    `;
  }

  private _renderEntityItem(itemId: string): TemplateResult {
    const stateObj: HassEntity | undefined = this.hass?.states[itemId];
    return html`
      <a class="related-item link" href=${this._entityHref(itemId)} @click=${this._linkClicked}>
        <ha-label dense class="entity-label">
          <ha-state-icon slot="icon" .hass=${this.hass} .stateObj=${stateObj}></ha-state-icon>
          ${itemId}
        </ha-label>
      </a>
    `;
  }

  private _renderEntityYamlItem(itemId: string): TemplateResult {
    const stateObj: HassEntity | undefined = this.hass?.states[itemId];
    return html`
      <ha-label dense class="entity-label yaml" .description=${"YAML"}>
        <ha-state-icon slot="icon" .hass=${this.hass} .stateObj=${stateObj}></ha-state-icon>
        ${itemId}
      </ha-label>
    `;
  }

  private _renderExposeItem(itemId: string): TemplateResult {
    return html`
      <a class="related-item link" href=${this._exposeHref(itemId)} @click=${this._linkClicked}>
        <ha-label
          dense
          class="expose-label"
          .description=${this.localize("component.knx.config_panel.expose.title")}
        >
          <ha-svg-icon slot="icon" .path=${exposeTab.iconPath}></ha-svg-icon>
          ${itemId}
        </ha-label>
      </a>
    `;
  }

  private _entityHref(entityId: string): string {
    return `/knx/entities/edit/${entityId}`;
  }

  private _exposeHref(entityId: string): string {
    return `/knx/expose/edit/${entityId}`;
  }

  private _linkClicked(ev: MouseEvent): void {
    // Use navigate() for normal clicks to stay in the HA SPA context (avoids iframe double-menu).
    // Middle-click and Ctrl/Cmd+click fall through to the browser to open in a new tab.
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    ev.preventDefault();
    ev.stopPropagation();
    navigate((ev.currentTarget as HTMLAnchorElement).href);
  }

  static styles = css`
    :host {
      display: block;
      flex-grow: 1;
    }

    ha-chip-set {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: flex-start;
      row-gap: 4px;
    }

    .entity-label {
      --ha-label-background-color: ${unsafeCSS(entitiesTab.iconColor)};
      --ha-label-background-opacity: 0.5;
    }

    .yaml {
      --ha-label-background-color: var(--disabled-color);
      cursor: default;
    }

    .expose-label {
      --ha-label-background-color: ${unsafeCSS(exposeTab.iconColor)};
      --ha-label-background-opacity: 0.5;
    }

    .link {
      color: inherit;
      text-decoration: none;
    }

    .related-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .open-menu {
      --ha-label-background-color: transparent;
      border: 1px solid var(--divider-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-data-table-related-label": KnxDataTableRelatedLabel;
  }
}
