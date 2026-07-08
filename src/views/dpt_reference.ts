import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type { TemplateResult } from "lit";

import "@ha/components/ha-alert";
import "@ha/components/ha-expansion-panel";
import "@ha/components/input/ha-input-search";
import "@ha/layouts/hass-tabs-subpage";
import type { HaInputSearch } from "@ha/components/input/ha-input-search";
import type { HomeAssistant, Route } from "@ha/types";

import { dptReferenceTab } from "../knx-router";
import type { KNX } from "../types/knx";
import type { DPTComplexFieldSchema } from "../types/websocket";
import type { DptReferenceEntry, DptReferenceGroup } from "../utils/dpt_reference";
import {
  filterDptReferenceEntries,
  groupDptReferenceEntries,
  groupPayloadLength,
  normalizeDptReferenceEntries,
  shouldRenderDptGroupAsCards,
} from "../utils/dpt_reference";
import { snakeToTitleCase } from "../utils/format";

@customElement("knx-dpt-reference")
export class KnxDptReference extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @state() private _filter = "";

  private _onFilterChanged(ev: InputEvent): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _renderEntry(entry: DptReferenceEntry): TemplateResult {
    const metadata = entry.metadata;
    const label =
      this.hass.localize(`component.knx.config_panel.dpt.options.${entry.dpt.replace(".", "_")}`) ||
      (metadata.name
        ? snakeToTitleCase(metadata.name)
        : this.hass.localize("state.default.unknown"));
    const detailRows: TemplateResult[] = [];

    if (metadata.unit) {
      detailRows.push(this._renderDetailRow("Unit", metadata.unit));
    }

    if (metadata.sensor_device_class) {
      detailRows.push(this._renderDetailRow("Device class", metadata.sensor_device_class));
    }

    if (metadata.sensor_state_class) {
      detailRows.push(this._renderDetailRow("State class", metadata.sensor_state_class));
    }

    if (metadata.dpt_class === "numeric") {
      if (metadata.min != null) {
        detailRows.push(this._renderDetailRow("Min", String(metadata.min)));
      }
      if (metadata.max != null) {
        detailRows.push(this._renderDetailRow("Max", String(metadata.max)));
      }
      if (metadata.step != null) {
        detailRows.push(this._renderDetailRow("Step", String(metadata.step)));
      }
    }

    if (metadata.dpt_class === "enum") {
      detailRows.push(
        this._renderDetailRow(
          "Options",
          metadata.options?.length ? this._renderValueList(metadata.options) : "No options",
        ),
      );
    }

    if (metadata.dpt_class === "complex") {
      detailRows.push(this._renderSchema(metadata.schema));
    }

    return html`
      <div class="entry-row">
        <div class="title-row">
          <div class="dpt-title">
            <div class="dpt-id">${entry.dpt} - ${label}</div>
            ${metadata.name ? html`<code class="dpt-raw-name">${metadata.name}</code>` : nothing}
          </div>
          <div class="dpt-class">${metadata.dpt_class}</div>
        </div>
        <div class="details-grid">${detailRows}</div>
      </div>
    `;
  }

  private _renderDetailRow(label: string, value: string | TemplateResult): TemplateResult {
    return html`
      <div>${label}</div>
      <div class="detail-value">${value}</div>
    `;
  }

  private _renderValueList(values: string[]): TemplateResult {
    return html`
      <ul class="detail-list">
        ${values.map((value) => html`<li><code>${value}</code></li>`)}
      </ul>
    `;
  }

  private _pythonRepr(value: number | boolean | string): string {
    if (typeof value === "string") {
      return `'${value}'`;
    }
    if (typeof value === "boolean") {
      return value ? "True" : "False";
    }
    return String(value);
  }

  private _renderSchema(schema: DPTComplexFieldSchema[] | undefined): TemplateResult {
    return html`
      <div class="schema-row">
        <div>Schema</div>
        ${schema?.length
          ? html`
              <ul class="schema-list">
                ${schema.map((field) => {
                  const details: (string | TemplateResult)[] = [
                    field.type,
                    field.required ? "required" : "optional",
                  ];
                  if (field.default != null) {
                    details.push(html`default: <code>${this._pythonRepr(field.default)}</code>`);
                  }
                  if (field.value_min != null) {
                    details.push(`min: ${field.value_min}`);
                  }
                  if (field.value_max != null) {
                    details.push(`max: ${field.value_max}`);
                  }
                  if (field.options?.length) {
                    const pythonList = `[${field.options.map((opt) => this._pythonRepr(opt)).join(", ")}]`;
                    details.push(html`options: <code>${pythonList}</code>`);
                  }
                  return html`
                    <li>
                      <code>${field.name}</code>
                      <span>
                        ${details.map((part, index) => html`${index > 0 ? ", " : ""}${part}`)}
                      </span>
                    </li>
                  `;
                })}
              </ul>
            `
          : html`<div class="detail-value">No schema fields</div>`}
      </div>
    `;
  }

  private _groupSecondary(group: DptReferenceGroup, includeCount: boolean): string {
    const payloadLength = groupPayloadLength(group);
    const payloadLabel = payloadLength != null ? `Payload length: ${payloadLength}` : undefined;
    if (!includeCount) {
      return payloadLabel ?? "";
    }
    const countLabel = `${group.items.length} datapoint types`;
    return payloadLabel ? `${countLabel} · ${payloadLabel}` : countLabel;
  }

  private _renderNoCollapseGroup(group: DptReferenceGroup): TemplateResult {
    return html`
      <ha-expansion-panel
        outlined
        no-collapse
        expanded
        .header=${`DPT ${group.main}.x`}
        .secondary=${this._groupSecondary(group, false)}
      >
        <div class="expanded-grid">${group.items.map((item) => this._renderEntry(item))}</div>
      </ha-expansion-panel>
    `;
  }

  private _renderExpandableGroup(group: DptReferenceGroup): TemplateResult {
    return html`
      <ha-expansion-panel
        outlined
        left-chevron
        .header=${`DPT ${group.main}.x`}
        .secondary=${this._groupSecondary(group, true)}
      >
        <div class="expanded-grid">${group.items.map((item) => this._renderEntry(item))}</div>
      </ha-expansion-panel>
    `;
  }

  private _searchLabel(count: number): string {
    return this.knx.localize("dpt_reference_search_label", { count });
  }

  protected render() {
    const entries = normalizeDptReferenceEntries(this.knx.dptMetadata ?? {});
    const filteredEntries = filterDptReferenceEntries(entries, this._filter);
    const groupedEntries = groupDptReferenceEntries(filteredEntries);

    const searchBar = html`<ha-input-search
      appearance="outlined"
      .value=${this._filter}
      @input=${this._onFilterChanged}
      placeholder=${this._searchLabel(entries.length)}
    ></ha-input-search>`;

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .route=${this.route!}
        .tabs=${[dptReferenceTab]}
        .localizeFunc=${this.knx.localize}
      >
        ${this.narrow ? html`<div slot="header" class="header-search">${searchBar}</div>` : nothing}
        <div class="wrapper">
          ${!this.narrow ? html`<div class="table-header">${searchBar}</div>` : nothing}
          <div class="list-content">
            ${entries.length === 0
              ? html`<ha-alert alert-type="info"
                  >No datapoint type metadata available from backend.</ha-alert
                >`
              : nothing}
            ${entries.length > 0 && groupedEntries.length === 0
              ? html`<ha-alert alert-type="warning"
                  >No datapoint types match the current search.</ha-alert
                >`
              : nothing}
            ${groupedEntries.map((group) =>
              shouldRenderDptGroupAsCards(group)
                ? this._renderNoCollapseGroup(group)
                : this._renderExpandableGroup(group),
            )}
          </div>
        </div>
      </hass-tabs-subpage>
    `;
  }

  static styles = css`
    :host([narrow]) hass-tabs-subpage {
      --main-title-margin: 0;
    }

    .wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .table-header {
      display: flex;
      align-items: center;
      height: 56px;
      width: 100%;
      justify-content: space-between;
      padding: 0 16px;
      gap: var(--ha-space-4);
      box-sizing: border-box;
      background: var(--primary-background-color);
      border-bottom: 1px solid var(--divider-color);
    }

    ha-input-search {
      flex: 1;
    }

    @media (min-width: 871px) {
      .table-header ha-input-search {
        --ha-input-search-height: 32px;
        --ha-input-search-border-radius: 10px;
      }
    }

    .header-search {
      display: flex;
      align-items: center;
      width: 100%;
      color: var(--secondary-text-color);
    }

    .list-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 8px;
      overflow-y: auto;
      flex: 1;
    }

    .expanded-grid {
      display: flex;
      flex-direction: column;
      padding: 8px 0;
    }

    .entry-row {
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color);
    }

    .entry-row:last-child {
      border-bottom: none;
    }

    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .dpt-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .dpt-id {
      font-weight: 600;
    }

    .dpt-raw-name {
      font-weight: var(--ha-font-weight-normal, 400);
      font-size: 0.75rem;
      color: var(--secondary-text-color);
      width: fit-content;
    }

    .dpt-class {
      text-transform: capitalize;
      color: var(--secondary-text-color);
      font-size: 0.85rem;
    }

    .details-grid {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 12px;
      font-size: 0.92rem;
    }

    .detail-value {
      overflow-wrap: anywhere;
    }

    .detail-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .detail-list li {
      margin: 0;
      line-height: 1.3;
    }

    .schema-row {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .schema-list {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 2px 12px;
      margin: 0;
      padding: 0;
      margin-inline-start: var(--ha-space-2);
      list-style: none;
      line-height: 1.3;
    }

    .schema-list li {
      display: contents;
    }

    code {
      font-family: var(--ha-font-family-code);
      background: var(--markdown-code-background-color, var(--secondary-background-color));
      border-radius: var(--ha-border-radius-sm);
      padding: 1px 4px;
      width: fit-content;
    }

    @media (max-width: 600px) {
      .list-content {
        margin: 0;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-dpt-reference": KnxDptReference;
  }
}
