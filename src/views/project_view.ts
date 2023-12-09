import { mdiFilterVariant, mdiPlus } from "@mdi/js";
import { LitElement, TemplateResult, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import memoize from "memoize-one";

import { HASSDomEvent } from "@ha/common/dom/fire_event";
import { navigate } from "@ha/common/navigate";
import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-card";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-icon-overflow-menu";
import type { IconOverflowMenuItem } from "@ha/components/ha-icon-overflow-menu";
import "@ha/components/data-table/ha-data-table";
import type { DataTableColumnContainer } from "@ha/components/data-table/ha-data-table";

import "../components/knx-project-tree-view";

import { compare } from "compare-versions";

import { HomeAssistant, Route } from "@ha/types";
import { KNX } from "../types/knx";
import type { GroupRangeSelectionChangedEvent } from "../components/knx-project-tree-view";
import { GroupAddress } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";

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

  @property({ type: Boolean, reflect: true }) private rangeSelectorHidden = true;

  @state() private _visibleGroupAddresses: string[] = [];

  @state() private _groupRangeAvailable: boolean = false;

  protected firstUpdated() {
    if (!this.knx.project) {
      this.knx.loadProject().then(() => {
        this._isGroupRangeAvailable();
        this.requestUpdate();
      });
    } else {
      // project was already loaded
      this._isGroupRangeAvailable();
    }
  }

  private _isGroupRangeAvailable() {
    const projectVersion = this.knx.project?.knxproject.info.xknxproject_version ?? "0.0.0";
    logger.debug("project version: " + projectVersion);
    this._groupRangeAvailable = compare(projectVersion, MIN_XKNXPROJECT_VERSION, ">=");
  }

  private _columns = memoize((_narrow, _language): DataTableColumnContainer<GroupAddress> => {
    const addressWidth = "100px";
    const dptWidth = "82px";
    const overflowMenuWidth = "72px";

    return {
      address: {
        filterable: true,
        sortable: true,
        title: this.knx.localize("project_view_table_address"),
        width: addressWidth,
      },
      name: {
        filterable: true,
        sortable: true,
        title: this.knx.localize("project_view_table_name"),
        width: `calc(100% - ${dptWidth} - ${addressWidth} - ${overflowMenuWidth})`,
      },
      dpt: {
        sortable: true,
        filterable: true,
        title: this.knx.localize("project_view_table_dpt"),
        width: dptWidth,
        template: (ga: GroupAddress) =>
          ga.dpt
            ? html`<span style="display:inline-block;width:24px;text-align:right;"
                  >${ga.dpt.main}</span
                >${ga.dpt.sub ? "." + ga.dpt.sub.toString().padStart(3, "0") : ""} `
            : "",
      },
      actions: {
        title: "",
        width: overflowMenuWidth,
        type: "overflow-menu",
        template: (ga: GroupAddress) => this._groupAddressMenu(ga),
      },
    };
  });

  private _groupAddressMenu(groupAddress: GroupAddress): TemplateResult | typeof nothing {
    const items: IconOverflowMenuItem[] = [];
    if (groupAddress.dpt?.main === 1) {
      items.push({
        path: mdiPlus,
        label: this.knx.localize("project_view_add_switch"),
        action: () => {
          navigate("/knx/entities/create?ga=" + groupAddress.address);
        },
      });
      // items.push({
      //   path: mdiPlus,
      //   label: "Add binary sensor",
      //   action: () => logger.warn(groupAddress.address),
      // });
    }

    return items.length
      ? html`
          <ha-icon-overflow-menu .hass=${this.hass} narrow .items=${items}> </ha-icon-overflow-menu>
        `
      : nothing;
  }

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

      :host([narrow][rangeSelectorHidden]) knx-project-tree-view {
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
