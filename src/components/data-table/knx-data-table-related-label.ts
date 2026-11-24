import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { repeat } from "lit/directives/repeat";
import { mdiInformationOffOutline } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";

import "@ha/components/chips/ha-chip-set";
import "@ha/components/ha-dropdown";
import "@ha/components/ha-dropdown-item";
import "@ha/components/ha-label";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";

import { navigate } from "@ha/common/navigate";
import { stopPropagation } from "@ha/common/dom/stop_propagation";
import type { HomeAssistant } from "@ha/types";

import type { RelatedExpose } from "../../data/exposes-by-group";
import type { RelatedEntity } from "../../data/knx-entities-by-group-context";
import { entitiesTab, exposeTab } from "../../knx-router";
import { consumeKnxLocalize } from "../../localize/consume-knx-localize";
import type { KnxLocalizeFunc } from "../../localize/localize";

const exposeKey = (expose: RelatedExpose): string =>
  `${expose.entity_id}:${expose.ui ? "ui" : "yaml"}`;

@customElement("knx-data-table-related-label")
class KnxDataTableRelatedLabel extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public entities: RelatedEntity[] = [];

  @property({ attribute: false }) public exposes: RelatedExpose[] = [];

  @state()
  @consumeKnxLocalize()
  private localize!: KnxLocalizeFunc;

  protected render(): TemplateResult | typeof nothing {
    const totalItems = this.entities.length + this.exposes.length;
    if (!totalItems) {
      return nothing;
    }

    if (totalItems <= 2) {
      return html`
        <ha-chip-set>
          ${repeat(
            this.entities,
            (entity) => entity.entity_id,
            (entity) => this._renderEntityItem(entity),
          )}
          ${repeat(this.exposes, exposeKey, (expose) => this._renderExposeItem(expose))}
        </ha-chip-set>
      `;
    }

    return html`
      <ha-chip-set> ${this._renderEntitiesSection()} ${this._renderExposesSection()} </ha-chip-set>
    `;
  }

  private _renderEntitiesSection(): TemplateResult | typeof nothing {
    const itemCount = this.entities.length;
    if (!itemCount) {
      return nothing;
    }

    if (itemCount === 1) {
      return this._renderEntityItem(this.entities[0]);
    }

    const openDropdownLabel = this.localize("ui.components.target-picker.entities_count", {
      count: itemCount,
    });

    return html`
      <ha-dropdown role="button" tabindex="0" @click=${stopPropagation}>
        <ha-label slot="trigger" class="open-menu" dense>${openDropdownLabel}</ha-label>
        ${repeat(
          this.entities,
          (entity) => entity.entity_id,
          (entity) =>
            html`<ha-dropdown-item .value=${entity.entity_id}>
              ${this._renderEntityItem(entity)}
            </ha-dropdown-item>`,
        )}
      </ha-dropdown>
    `;
  }

  private _renderExposesSection(): TemplateResult | typeof nothing {
    const itemCount = this.exposes.length;
    if (!itemCount) {
      return nothing;
    }

    if (itemCount === 1) {
      return this._renderExposeItem(this.exposes[0]);
    }

    const openDropdownLabel = this.localize("component.knx.config_panel.common.exposes_count", {
      count: itemCount,
    });

    return html`
      <ha-dropdown role="button" tabindex="0" @click=${stopPropagation}>
        <ha-label slot="trigger" class="open-menu" dense>${openDropdownLabel}</ha-label>
        ${repeat(
          this.exposes,
          exposeKey,
          (expose) =>
            html`<ha-dropdown-item .value=${exposeKey(expose)}>
              ${this._renderExposeItem(expose)}
            </ha-dropdown-item>`,
        )}
      </ha-dropdown>
    `;
  }

  private _renderEntityItem(entity: RelatedEntity): TemplateResult {
    const label = html`
      <ha-label
        dense
        class=${classMap({
          "entity-label": true,
          "text-ellipsis": true,
          yaml: !entity.ui,
          disabled: entity.disabled,
        })}
        .description=${entity.ui ? undefined : "YAML"}
        title=${ifDefined(
          entity.disabled
            ? this.localize("ui.panel.config.entities.picker.status.disabled")
            : undefined,
        )}
      >
        ${this._renderEntityIcon(entity)} ${entity.entity_id}
      </ha-label>
    `;
    if (!entity.ui) {
      return label;
    }
    return html`
      <a
        class="related-item link"
        href=${this._entityHref(entity.entity_id)}
        @click=${this._linkClicked}
      >
        ${label}
      </a>
    `;
  }

  private _renderEntityIcon(entity: RelatedEntity): TemplateResult {
    // a disabled entity has no state object to derive an icon from
    if (entity.disabled) {
      return html`<ha-svg-icon slot="icon" .path=${mdiInformationOffOutline}></ha-svg-icon>`;
    }
    const stateObj: HassEntity | undefined = this.hass?.states[entity.entity_id];
    return html`<ha-state-icon
      slot="icon"
      .hass=${this.hass}
      .stateObj=${stateObj}
    ></ha-state-icon>`;
  }

  private _renderExposeItem(expose: RelatedExpose): TemplateResult {
    const label = html`
      <ha-label
        dense
        class=${classMap({ "expose-label": true, "text-ellipsis": true, yaml: !expose.ui })}
        .description=${
          expose.ui ? this.localize("component.knx.config_panel.expose.title") : "YAML expose" // not translated - `expose` is the YAML key
        }
      >
        <ha-svg-icon slot="icon" .path=${exposeTab.iconPath}></ha-svg-icon>
        ${expose.entity_id}
      </ha-label>
    `;
    // YAML exposes can not be edited in the panel
    if (!expose.ui) {
      return label;
    }
    return html`
      <a
        class="related-item link"
        href=${this._exposeHref(expose.entity_id)}
        @click=${this._linkClicked}
      >
        ${label}
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
      min-width: 0;
      max-width: 100%;
    }

    /* long entity ids are cropped instead of widening the container */
    ha-chip-set > *,
    ha-dropdown-item .related-item {
      min-width: 0;
      max-width: 100%;
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

    .expose-label {
      --ha-label-background-color: ${unsafeCSS(exposeTab.iconColor)};
      --ha-label-background-opacity: 0.5;
    }

    .yaml {
      --ha-label-background-color: var(--disabled-color);
      cursor: default;
    }

    .disabled {
      /* fade background and text moderately - both at once must stay readable */
      --ha-label-background-opacity: 0.25;
      --ha-label-text-color: var(--secondary-text-color);
      --ha-label-icon-color: var(--secondary-text-color);
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
      cursor: pointer;
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
