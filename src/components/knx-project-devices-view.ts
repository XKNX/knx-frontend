import { mdiMapMarkerOutline, mdiNetworkOutline, mdiSwapHorizontalCircle } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";

import memoize from "memoize-one";

import "@ha/components/ha-alert";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-svg-icon";
import { relativeTime } from "@ha/common/datetime/relative_time";
import type { HomeAssistant } from "@ha/types";

import "./data-table/knx-data-table-related-label";

import type { KNX } from "../types/knx";
import type { KNXProject, COFlags, GroupAddress, TelegramDict } from "../types/websocket";
import type {
  ComObjectItem,
  DeviceLine,
  DeviceLocation,
  DeviceTreeItem,
} from "../utils/project-structure";
import { buildDeviceTree, filterDeviceTree } from "../utils/project-structure";
import { dptToString } from "../utils/dpt";
import { TelegramDictFormatter } from "../utils/format";

interface RelatedRefs {
  entities: string[];
  entitiesYaml: string[];
  exposes: string[];
}

interface ScopeRelated {
  aggregated: RelatedRefs | null;
  byGa: Record<string, RelatedRefs>;
}

const hasRelatedRefs = (refs?: RelatedRefs | null): refs is RelatedRefs =>
  !!refs && !!(refs.entities.length || refs.entitiesYaml.length || refs.exposes.length);

const gaDptString = (ga: GroupAddress) => {
  const dpt = dptToString(ga.dpt);
  return dpt ? `DPT ${dpt}` : "";
};

const comObjectFlags = (flags: COFlags): string =>
  // – are en-dashes
  `${flags.read ? "R" : "–"} ${flags.write ? "W" : "–"} ${flags.transmit ? "T" : "–"} ${
    flags.update ? "U" : "–"
  }`;

const channelKey = (ia: string, chId: string) => `${ia}_ch_${chId}`;

const isChannelKey = (key: string) => key.includes("_ch_");

@customElement("knx-project-devices-view")
export class KNXProjectDevicesView extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public data!: KNXProject;

  @property({ attribute: false }) public lastTelegrams: Record<string, TelegramDict> = {};

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public filterDpt: string[] = [];

  @property({ attribute: false }) public filterLocation: string[] = [];

  @property({ attribute: false }) public filterLine: string[] = [];

  @property({ attribute: false }) public locationByDevice: Record<string, DeviceLocation> | null =
    null;

  @property({ attribute: false }) public lineByDevice: Record<string, DeviceLine> | null = null;

  @property({ attribute: false }) public entitiesByGroup: Record<
    string,
    { ui: string[]; yaml: string[] }
  > | null = null;

  @property({ attribute: false }) public exposesByGA: Record<string, string[]> | null = null;

  @property({ attribute: false }) public searchText = "";

  // manually expanded devices while no deep filter (search / DPT) is active
  @state() private _expanded = new Set<string>();

  // manually collapsed channels - channels are expanded by default
  @state() private _collapsedChannels = new Set<string>();

  // panels manually collapsed while a deep filter force-expands matches
  @state() private _manuallyCollapsed = new Set<string>();

  private _deviceItems = memoize((data: KNXProject): DeviceTreeItem[] => buildDeviceTree(data));

  private _filteredItems = memoize(
    (
      items: DeviceTreeItem[],
      searchText: string,
      filterDpt: string[],
      filterLocation: string[],
      filterLine: string[],
      locationByDevice: Record<string, DeviceLocation> | null,
      lineByDevice: Record<string, DeviceLine> | null,
    ): DeviceTreeItem[] =>
      filterDeviceTree(
        items,
        { searchText, dpt: filterDpt, location: filterLocation, line: filterLine },
        locationByDevice,
        lineByDevice,
      ),
  );

  private _relatedByScope = memoize(
    (
      items: DeviceTreeItem[],
      entitiesByGroup: Record<string, { ui: string[]; yaml: string[] }> | null,
      exposesByGA: Record<string, string[]> | null,
    ): Record<string, ScopeRelated> => {
      const result: Record<string, ScopeRelated> = {};
      if (!entitiesByGroup && !exposesByGA) {
        return result;
      }
      const processScope = (scopeKey: string, comObjects: ComObjectItem[]) => {
        // distinct GA addresses per related item within this scope
        const itemGas = new Map<string, Set<string>>();
        const addressSet = new Set<string>();
        comObjects.forEach((item) =>
          item.groupAddresses.forEach((ga) => addressSet.add(ga.address)),
        );
        addressSet.forEach((address) => {
          entitiesByGroup?.[address]?.ui.forEach((id) => {
            (itemGas.get(`ui:${id}`) ?? itemGas.set(`ui:${id}`, new Set()).get(`ui:${id}`)!).add(
              address,
            );
          });
          entitiesByGroup?.[address]?.yaml.forEach((id) => {
            (
              itemGas.get(`yaml:${id}`) ?? itemGas.set(`yaml:${id}`, new Set()).get(`yaml:${id}`)!
            ).add(address);
          });
          exposesByGA?.[address]?.forEach((id) => {
            (
              itemGas.get(`expose:${id}`) ??
              itemGas.set(`expose:${id}`, new Set()).get(`expose:${id}`)!
            ).add(address);
          });
        });
        if (!itemGas.size) {
          return;
        }
        const emptyRefs = (): RelatedRefs => ({ entities: [], entitiesYaml: [], exposes: [] });
        const aggregated = emptyRefs();
        const byGa: Record<string, RelatedRefs> = {};
        itemGas.forEach((gas, itemKey) => {
          const [type, id] = [
            itemKey.slice(0, itemKey.indexOf(":")),
            itemKey.slice(itemKey.indexOf(":") + 1),
          ];
          const target = gas.size >= 2 ? aggregated : (byGa[[...gas][0]] ??= emptyRefs());
          if (type === "ui") {
            target.entities.push(id);
          } else if (type === "yaml") {
            target.entitiesYaml.push(id);
          } else {
            target.exposes.push(id);
          }
        });
        result[scopeKey] = { aggregated: hasRelatedRefs(aggregated) ? aggregated : null, byGa };
      };

      items.forEach((device) => {
        if (device.noChannelComObjects.length) {
          processScope(device.ia, device.noChannelComObjects);
        }
        device.channels.forEach((channel) => {
          processScope(channelKey(device.ia, channel.id), channel.comObjects);
        });
      });
      return result;
    },
  );

  private get _deepFilterActive(): boolean {
    return Boolean(this.searchText.trim()) || this.filterDpt.length > 0;
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      (changedProperties.has("searchText") || changedProperties.has("filterDpt")) &&
      this._manuallyCollapsed.size
    ) {
      this._manuallyCollapsed = new Set();
    }
  }

  protected render(): TemplateResult {
    const deviceItems = this._deviceItems(this.data);
    const filtered = this._filteredItems(
      deviceItems,
      this.searchText,
      this.filterDpt,
      this.filterLocation,
      this.filterLine,
      this.locationByDevice,
      this.lineByDevice,
    );
    const relatedByScope = this._relatedByScope(
      deviceItems,
      this.entitiesByGroup,
      this.exposesByGA,
    );
    return html`
      <div class="content-wrapper">
        ${!deviceItems.length
          ? html`<ha-alert alert-type="info">
              ${this.hass.localize("component.knx.config_panel.project.devices.not_found")}
            </ha-alert>`
          : !filtered.length
            ? html`<ha-alert alert-type="info">
                ${this.hass.localize("ui.components.data-table.no_match_filter")}
              </ha-alert>`
            : html`<div class="devices">
                ${repeat(
                  filtered,
                  (device) => device.ia,
                  (device) => this._renderDevice(device, relatedByScope),
                )}
              </div>`}
      </div>
    `;
  }

  private _visiblePanelKeys(): string[] {
    const filtered = this._filteredItems(
      this._deviceItems(this.data),
      this.searchText,
      this.filterDpt,
      this.filterLocation,
      this.filterLine,
      this.locationByDevice,
      this.lineByDevice,
    );
    return filtered.flatMap((device) => [
      device.ia,
      ...device.channels.map((channel) => channelKey(device.ia, channel.id)),
    ]);
  }

  public expandAll(): void {
    if (this._deepFilterActive) {
      this._manuallyCollapsed = new Set();
    } else {
      this._expanded = new Set(this._visiblePanelKeys().filter((key) => !isChannelKey(key)));
      this._collapsedChannels = new Set();
    }
  }

  public collapseAll(): void {
    if (this._deepFilterActive) {
      this._manuallyCollapsed = new Set(this._visiblePanelKeys());
    } else {
      this._expanded = new Set();
      this._collapsedChannels = new Set(this._visiblePanelKeys().filter(isChannelKey));
    }
  }

  private _isExpanded(key: string): boolean {
    if (this._deepFilterActive) {
      return !this._manuallyCollapsed.has(key);
    }
    // channels are expanded by default, devices collapsed
    return isChannelKey(key) ? !this._collapsedChannels.has(key) : this._expanded.has(key);
  }

  /**
   * Intercept summary clicks / key presses of the expansion panels in capture
   * phase and toggle the controlled expansion state instead. Calling
   * preventDefault makes ha-expansion-panel skip its internal toggle, whose
   * height animation leaves stale inline heights when nested panels or
   * dynamic content change the content size afterwards.
   */
  private _summaryInterceptor = (ev: Event): void => {
    if (ev.type === "keydown") {
      const key = (ev as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") {
        return;
      }
    }
    const summary = ev.composedPath().find((target) => (target as HTMLElement).id === "summary") as
      | HTMLElement
      | undefined;
    if (!summary) {
      return;
    }
    const panel = (summary.getRootNode() as ShadowRoot).host as HTMLElement & {
      noCollapse: boolean;
      expanded: boolean;
    };
    const panelKey = panel.dataset.panelKey;
    if (!panelKey || panel.noCollapse) {
      return;
    }
    ev.preventDefault();
    this._setPanelExpanded(panelKey, !panel.expanded);
  };

  protected firstUpdated(): void {
    this.renderRoot.addEventListener("click", this._summaryInterceptor, true);
    this.renderRoot.addEventListener("keydown", this._summaryInterceptor, true);
  }

  private _setPanelExpanded(key: string, expanded: boolean): void {
    if (this._deepFilterActive) {
      const manuallyCollapsed = new Set(this._manuallyCollapsed);
      if (expanded) {
        manuallyCollapsed.delete(key);
      } else {
        manuallyCollapsed.add(key);
      }
      this._manuallyCollapsed = manuallyCollapsed;
    } else if (isChannelKey(key)) {
      const collapsedChannels = new Set(this._collapsedChannels);
      if (expanded) {
        collapsedChannels.delete(key);
      } else {
        collapsedChannels.add(key);
      }
      this._collapsedChannels = collapsedChannels;
    } else {
      const expandedSet = new Set(this._expanded);
      if (expanded) {
        expandedSet.add(key);
      } else {
        expandedSet.delete(key);
      }
      this._expanded = expandedSet;
    }
  }

  private _deviceSummary(device: DeviceTreeItem): string {
    const parts: string[] = [];
    if (device.channels.length) {
      parts.push(
        `${device.channels.length} ${this.hass.localize(
          "component.knx.config_panel.project.devices.channels",
        )}`,
      );
    }
    parts.push(
      `${device.comObjectCount} ${this.hass.localize(
        "component.knx.config_panel.project.devices.group_objects",
      )}`,
    );
    return parts.join(" · ");
  }

  private _renderDevice(
    device: DeviceTreeItem,
    relatedByScope: Record<string, ScopeRelated>,
  ): TemplateResult {
    const hasContent = !!device.noChannelComObjects.length || !!device.channels.length;
    const location = this.locationByDevice?.[device.ia];
    const line = this.lineByDevice?.[device.ia];
    const noChannelRelated = relatedByScope[device.ia];
    return html`<ha-expansion-panel
      outlined
      left-chevron
      .noCollapse=${!hasContent}
      .expanded=${hasContent && this._isExpanded(device.ia)}
      data-panel-key=${device.ia}
    >
      <div slot="header" class="device-header">
        <span class="icon ia">
          <ha-svg-icon .path=${mdiNetworkOutline}></ha-svg-icon>
          <span>${device.ia}</span>
        </span>
        <div class="description">
          <p>${device.name}</p>
          <p class="secondary">
            ${device.manufacturer}${device.description
              ? html` – ${device.description}`
              : nothing}${hasContent ? html` · ${this._deviceSummary(device)}` : nothing}
          </p>
        </div>
        <div class="device-pills">
          ${location
            ? html`<span class="pill" title=${location.path.join(" → ")}>
                <ha-svg-icon .path=${mdiMapMarkerOutline}></ha-svg-icon>
                ${location.name}
              </span>`
            : nothing}
          ${line ? html`<span class="pill" title=${line.mediumType}>${line.label}</span>` : nothing}
        </div>
      </div>
      ${hasContent
        ? html`${hasRelatedRefs(noChannelRelated?.aggregated)
            ? this._renderAggregatedRelated(noChannelRelated!.aggregated!)
            : nothing}
          ${this._renderComObjects(device.noChannelComObjects, noChannelRelated)}
          ${repeat(
            device.channels,
            (channel) => channelKey(device.ia, channel.id),
            (channel) => {
              const scopeKey = channelKey(device.ia, channel.id);
              const channelRelated = relatedByScope[scopeKey];
              return html`<ha-expansion-panel
                class="channel"
                outlined
                left-chevron
                .header=${channel.name}
                .expanded=${this._isExpanded(scopeKey)}
                data-panel-key=${scopeKey}
              >
                ${hasRelatedRefs(channelRelated?.aggregated)
                  ? this._renderAggregatedRelated(channelRelated!.aggregated!)
                  : nothing}
                ${this._renderComObjects(channel.comObjects, channelRelated)}
              </ha-expansion-panel>`;
            },
          )}`
        : nothing}
    </ha-expansion-panel>`;
  }

  private _renderAggregatedRelated(refs: RelatedRefs): TemplateResult {
    return html`<div class="scope-related">
      <span class="caption">${this.hass.localize("ui.dialogs.entity_registry.related")}</span>
      <knx-data-table-related-label
        .hass=${this.hass}
        .entities=${refs.entities}
        .entitiesYaml=${refs.entitiesYaml}
        .exposes=${refs.exposes}
      ></knx-data-table-related-label>
    </div>`;
  }

  private _renderComObjects(
    comObjects: ComObjectItem[],
    scopeRelated: ScopeRelated | undefined,
  ): TemplateResult {
    return html`${repeat(
      comObjects,
      (item) => `${item.comObject.device_address}_co_${item.comObject.number}`,
      (item) =>
        html`<div class="com-object">
          <div class="item">
            <span class="icon co">
              <ha-svg-icon .path=${mdiSwapHorizontalCircle}></ha-svg-icon>
              <span>${item.comObject.number}</span>
            </span>
            <div class="description">
              <p>
                ${item.comObject.text}${item.comObject.function_text
                  ? " - " + item.comObject.function_text
                  : nothing}
              </p>
              <p class="secondary">${comObjectFlags(item.comObject.flags)}</p>
            </div>
          </div>
          <ul class="group-addresses">
            ${this._renderGroupAddresses(item.groupAddresses, scopeRelated)}
          </ul>
        </div>`,
    )}`;
  }

  private _renderGroupAddresses(
    groupAddresses: GroupAddress[],
    scopeRelated: ScopeRelated | undefined,
  ): TemplateResult {
    return html`${repeat(
      groupAddresses,
      (groupAddress) => groupAddress.identifier,
      (groupAddress) => {
        const related = scopeRelated?.byGa[groupAddress.address];
        return html`<li class="group-address">
          <div class="item">
            <span class="icon ga">
              <span>${groupAddress.address}</span>
            </span>
            <div class="description">
              <p>${groupAddress.name}</p>
              <p class="secondary">${gaDptString(groupAddress)}</p>
            </div>
            ${hasRelatedRefs(related)
              ? html`<knx-data-table-related-label
                  class="ga-related"
                  .hass=${this.hass}
                  .entities=${related.entities}
                  .entitiesYaml=${related.entitiesYaml}
                  .exposes=${related.exposes}
                ></knx-data-table-related-label>`
              : nothing}
            ${this._renderLastValue(groupAddress)}
          </div>
        </li>`;
      },
    )}`;
  }

  private _renderLastValue(groupAddress: GroupAddress): TemplateResult | typeof nothing {
    const telegram: TelegramDict | undefined = this.lastTelegrams[groupAddress.address];
    if (!telegram) {
      return nothing;
    }
    const payload = TelegramDictFormatter.payload(telegram);
    const tooltip = `${TelegramDictFormatter.dateWithMilliseconds(telegram)}\n${telegram.source} ${
      telegram.source_name
    }\n${payload}`;
    return html`<div class="last-value" title=${tooltip}>
      <p>
        ${telegram.value != null
          ? TelegramDictFormatter.valueWithUnit(telegram)
          : html`<code>${payload}</code>`}
      </p>
      <p class="secondary">${relativeTime(new Date(telegram.timestamp), this.hass.locale)}</p>
    </div>`;
  }

  static styles = css`
    :host {
      /* the host is the scroll container and spans the full content width,
         so scrolling works everywhere; the wrapper centers the content */
      display: block;
    }

    .content-wrapper {
      box-sizing: border-box;
      max-width: 1280px;
      margin: 0 auto;
      padding: 8px 16px 16px;
    }

    ha-alert {
      display: block;
      margin-top: 8px;
    }

    ha-expansion-panel {
      margin-top: 8px;
      background-color: var(--card-background-color);
    }

    ha-expansion-panel.channel {
      margin: 4px 8px 8px;
      --expansion-panel-summary-padding: 0 8px;
      --expansion-panel-content-padding: 0 8px;
      font-weight: 500;
    }

    .device-header {
      display: flex;
      align-items: center;
      min-width: 0;
      width: 100%;
      padding: 4px 0;
    }

    .device-pills {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
    }

    :host([narrow]) .device-pills {
      display: none;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      max-width: 160px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--secondary-text-color);
      background-color: var(--secondary-background-color);
      border-radius: 10px;
      padding: 2px 8px;

      & > ha-svg-icon {
        width: 12px;
        height: 12px;
        flex: 0 0 auto;
      }
    }

    .item {
      display: flex;
      align-items: center;
      min-width: 0;
      border-radius: 4px;
    }

    .com-object > .item:hover,
    li.group-address .item:hover {
      background-color: rgba(var(--rgb-primary-text-color), 0.04);
    }

    .description {
      flex: 1;
      min-width: 0;
      margin-top: 4px;
      margin-bottom: 4px;
    }

    .description p {
      margin: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    p.secondary {
      font-size: 0.85rem;
      font-weight: 300;
      color: var(--secondary-text-color);
    }

    span.icon {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;

      color: var(--text-primary-color);
      font-size: 1rem;
      font-weight: 700;
      border-radius: 12px;
      padding: 3px 6px;
      margin-right: 8px;

      & > ha-svg-icon {
        width: 16px;
        height: 16px;
        margin-right: 4px;
      }

      & > span {
        flex: 1;
        text-align: center;
      }
    }

    span.ia {
      flex-basis: 70px;
      background-color: var(--label-badge-grey);
      & > ha-svg-icon {
        transform: rotate(90deg);
      }
    }

    span.co {
      flex-basis: 44px;
      background-color: var(--amber-color);
    }

    span.ga {
      flex-basis: 54px;
      background-color: var(--knx-green);
    }

    .scope-related {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0 8px;
      padding: 4px 8px;
      border-radius: 8px;
      background-color: rgba(var(--rgb-primary-text-color), 0.04);

      & > .caption {
        flex: 0 0 auto;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--secondary-text-color);
      }
    }

    .com-object {
      margin: 6px 0 10px;
    }

    ul.group-addresses {
      list-style-type: none;
      padding-left: 16px;
      margin: 2px 0 0;

      & > li:not(:first-child) {
        /* passive addresses for this com-object */
        opacity: 0.8;
      }
    }

    li.group-address {
      margin-top: 2px;
    }

    li.group-address .item {
      /* allow related label and value to wrap below on narrow rows */
      flex-wrap: wrap;
    }

    li.group-address .description {
      min-width: 160px;
    }

    .ga-related {
      flex: 0 1 auto;
      margin-left: 16px;
    }

    .last-value {
      flex: 0 0 auto;
      margin-left: auto;
      padding-left: 16px;
      text-align: right;

      & p {
        margin: 0;
        white-space: nowrap;
        font-weight: 500;
      }

      & p.secondary {
        font-weight: 300;
      }

      & code {
        font-family: var(--ha-font-family-code, monospace);
        font-size: 0.9em;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-devices-view": KNXProjectDevicesView;
  }
}
