import { mdiFilterVariant } from "@mdi/js";
import { LitElement, TemplateResult, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import memoize from "memoize-one";

import { HASSDomEvent } from "@ha/common/dom/fire_event";
import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-card";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-icon-overflow-menu";
import "@ha/components/data-table/ha-data-table";
import type { DataTableColumnContainer } from "@ha/components/data-table/ha-data-table";
import { relativeTime } from "@ha/common/datetime/relative_time";
import { navigate } from "@ha/common/navigate";

import "../components/knx-project-tree-view";

import { compare } from "compare-versions";

import { HomeAssistant, Route } from "@ha/types";
import { KNX } from "../types/knx";
import type { GroupRangeSelectionChangedEvent } from "../components/knx-project-tree-view";
import { subscribeKnxTelegrams, getGroupTelegrams } from "../services/websocket.service";
import { GroupAddress, TelegramDict } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";
import { TelegramDictFormatter } from "../utils/format";

const logger = new KNXLogger("knx-project-view");
// Minimum XKNXProject Version needed which was used for parsing the ETS Project
const MIN_XKNXPROJECT_VERSION = "3.3.0";

@customElement("knx-project-view")
export class KNXProjectView extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  @property({ type: Boolean, reflect: true, attribute: "range-selector-hidden" })
  public rangeSelectorHidden = true;

  @state() private _visibleGroupAddresses: string[] = [];

  @state() private _groupRangeAvailable: boolean = false;

  @state() private _subscribed?: () => void;

  @state() private _lastTelegrams: { [ga: string]: TelegramDict } = {};

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this._subscribed) {
      this._subscribed();
      this._subscribed = undefined;
    }
  }

  protected async firstUpdated() {
    if (!this.knx.project) {
      this.knx.loadProject().then(() => {
        this._isGroupRangeAvailable();
        this.requestUpdate();
      });
    } else {
      // project was already loaded
      this._isGroupRangeAvailable();
    }

    getGroupTelegrams(this.hass)
      .then((groupTelegrams) => {
        this._lastTelegrams = groupTelegrams;
      })
      .catch((err) => {
        logger.error("getGroupTelegrams", err);
        navigate("/knx/error", { replace: true, data: err });
      });
    this._subscribed = await subscribeKnxTelegrams(this.hass, (telegram) => {
      this.telegram_callback(telegram);
    });
  }

  private _isGroupRangeAvailable() {
    const projectVersion = this.knx.project?.knxproject.info.xknxproject_version ?? "0.0.0";
    logger.debug("project version: " + projectVersion);
    this._groupRangeAvailable = compare(projectVersion, MIN_XKNXPROJECT_VERSION, ">=");
  }

  protected telegram_callback(telegram: TelegramDict): void {
    this._lastTelegrams = {
      ...this._lastTelegrams,
      [telegram.destination]: telegram,
    };
  }

  private _columns = memoize((_narrow, _language): DataTableColumnContainer<GroupAddress> => {
    const addressWidth = "100px";
    const dptWidth = "82px";

    return {
      address: {
        filterable: true,
        sortable: true,
        title: this.knx.localize("project_view_table_address"),
        flex: 1,
        minWidth: addressWidth,
      },
      name: {
        filterable: true,
        sortable: true,
        title: this.knx.localize("project_view_table_name"),
        flex: 3,
      },
      dpt: {
        sortable: true,
        filterable: true,
        title: this.knx.localize("project_view_table_dpt"),
        flex: 1,
        minWidth: dptWidth,
        template: (ga: GroupAddress) =>
          ga.dpt
            ? html`<span style="display:inline-block;width:24px;text-align:right;"
                  >${ga.dpt.main}</span
                >${ga.dpt.sub ? "." + ga.dpt.sub.toString().padStart(3, "0") : ""} `
            : "",
      },
      lastValue: {
        filterable: true,
        title: this.knx.localize("project_view_table_last_value"),
        flex: 2,
        template: (ga: GroupAddress) => {
          const lastTelegram: TelegramDict | undefined = this._lastTelegrams[ga.address];
          if (!lastTelegram) return "";
          const payload = TelegramDictFormatter.payload(lastTelegram);
          if (lastTelegram.value == null) return html`<code>${payload}</code>`;
          return html`<div title=${payload}>
            ${TelegramDictFormatter.valueWithUnit(this._lastTelegrams[ga.address])}
          </div>`;
        },
      },
      updated: {
        title: this.knx.localize("project_view_table_updated"),
        flex: 1,
        showNarrow: false,
        template: (ga: GroupAddress) => {
          const lastTelegram: TelegramDict | undefined = this._lastTelegrams[ga.address];
          if (!lastTelegram) return "";
          const tooltip = `${TelegramDictFormatter.dateWithMilliseconds(lastTelegram)}\n\n${lastTelegram.source} ${lastTelegram.source_name}`;
          return html`<div title=${tooltip}>
            ${relativeTime(new Date(lastTelegram.timestamp), this.hass.locale)}
          </div>`;
        },
      },
    };
  });

  private _getRows(visibleGroupAddresses: string[]): GroupAddress[] {
    if (!visibleGroupAddresses.length)
      // if none is set, default to show all
      return Object.values(this.knx.project!.knxproject.group_addresses);

    return Object.entries(this.knx.project!.knxproject.group_addresses).reduce(
      (result, [key, groupAddress]) => {
        if (visibleGroupAddresses.includes(key)) {
          result.push(groupAddress);
        }
        return result;
      },
      [] as GroupAddress[],
    );
  }

  private _visibleAddressesChanged(ev: HASSDomEvent<GroupRangeSelectionChangedEvent>) {
    this._visibleGroupAddresses = ev.detail.groupAddresses;
  }

  protected render(): TemplateResult | void {
    if (!this.hass || !this.knx.project) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }

    const filtered = this._getRows(this._visibleGroupAddresses);

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .route=${this.route!}
        .tabs=${this.tabs}
        .localizeFunc=${this.knx.localize}
      >
        ${this.knx.project.project_loaded
          ? html`${this.narrow && this._groupRangeAvailable
                ? html`<ha-icon-button
                    slot="toolbar-icon"
                    .label=${this.hass.localize("ui.components.related-filter-menu.filter")}
                    .path=${mdiFilterVariant}
                    @click=${this._toggleRangeSelector}
                  ></ha-icon-button>`
                : nothing}
              <div class="sections">
                ${this._groupRangeAvailable
                  ? html`
                      <knx-project-tree-view
                        .data=${this.knx.project.knxproject}
                        @knx-group-range-selection-changed=${this._visibleAddressesChanged}
                      ></knx-project-tree-view>
                    `
                  : nothing}
                <ha-data-table
                  class="ga-table"
                  .hass=${this.hass}
                  .columns=${this._columns(this.narrow, this.hass.language)}
                  .data=${filtered}
                  .hasFab=${false}
                  .searchLabel=${this.hass.localize("ui.components.data-table.search")}
                  .clickable=${false}
                ></ha-data-table>
              </div>`
          : html` <ha-card .header=${this.knx.localize("attention")}>
              <div class="card-content">
                <p>${this.knx.localize("project_view_upload")}</p>
              </div>
            </ha-card>`}
      </hass-tabs-subpage>
    `;
  }

  private _toggleRangeSelector() {
    this.rangeSelectorHidden = !this.rangeSelectorHidden;
  }

  static get styles() {
    return css`
      hass-loading-screen {
        --app-header-background-color: var(--sidebar-background-color);
        --app-header-text-color: var(--sidebar-text-color);
      }
      .sections {
        display: flex;
        flex-direction: row;
        height: 100%;
      }

      :host([narrow]) knx-project-tree-view {
        position: absolute;
        max-width: calc(100% - 60px); /* 100% -> max 871px before not narrow */
        z-index: 1;
        right: 0;
        transition: 0.5s;
        border-left: 1px solid var(--divider-color);
      }

      :host([narrow][range-selector-hidden]) knx-project-tree-view {
        width: 0;
      }

      :host(:not([narrow])) knx-project-tree-view {
        max-width: 255px; /* min 616px - 816px for tree-view + ga-table (depending on side menu) */
      }

      .ga-table {
        flex: 1;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-view": KNXProjectView;
  }
}
