import { mdiPlus, mdiMathLog } from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { Task } from "@lit/task";

import memoize from "memoize-one";

import { storage } from "@ha/common/decorators/storage";
import type { HASSDomEvent } from "@ha/common/dom/fire_event";
import { navigate } from "@ha/common/navigate";
import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage";
import "@ha/layouts/hass-tabs-subpage-data-table";
import "@ha/components/ha-alert";
import "@ha/components/ha-icon-overflow-menu";
import type {
  DataTableColumnContainer,
  DataTableRowData,
} from "@ha/components/data-table/ha-data-table";
import type { IconOverflowMenuItem } from "@ha/components/ha-icon-overflow-menu";
import { relativeTime } from "@ha/common/datetime/relative_time";

import "../components/knx-project-tree-view";

import { compare } from "compare-versions";

import type { HomeAssistant, Route } from "@ha/types";
import { dptInClasses, dptToString } from "utils/dpt";
import type { KNX } from "../types/knx";
import { projectTab } from "../knx-router";
import type { GroupRangeSelectionChangedEvent } from "../components/knx-project-tree-view";
import { subscribeKnxTelegrams, getGroupTelegrams } from "../services/websocket.service";
import type { GroupAddress, TelegramDict, KNXProject } from "../types/websocket";
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

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true, attribute: "range-selector-hidden" })
  public rangeSelectorHidden = true;

  @state() private _visibleGroupAddresses: string[] = [];

  @state() private _groupRangeAvailable = false;

  @state() private _subscribed?: () => void;

  @state() private _lastTelegrams: Record<string, TelegramDict> = {};

  @storage({
    key: "knx-project-view-columns",
    state: false,
    subscribe: false,
  })
  private _storedColumns?: {
    wide?: { columnOrder?: string[]; hiddenColumns?: string[] };
    narrow?: { columnOrder?: string[]; hiddenColumns?: string[] };
  };

  private _projectLoadTask = new Task(this, {
    args: () => [],
    task: async () => {
      if (!!this.knx.projectInfo && !this.knx.projectData) {
        await this.knx.loadProject();
      }
      this._isGroupRangeAvailable();
    },
  });

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this._subscribed) {
      this._subscribed();
      this._subscribed = undefined;
    }
  }

  protected async firstUpdated() {
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
    const projectVersion = this.knx.projectData?.info.xknxproject_version ?? "0.0.0";
    logger.debug("project version: " + projectVersion);
    this._groupRangeAvailable = compare(projectVersion, MIN_XKNXPROJECT_VERSION, ">=");
  }

  protected telegram_callback(telegram: TelegramDict): void {
    this._lastTelegrams = {
      ...this._lastTelegrams,
      [telegram.destination]: telegram,
    };
  }

  private _columns = memoize(
    (narrow, _language): DataTableColumnContainer<GroupAddress & { dpt_raw: string }> => {
      const addressWidth = "100px";
      const dptWidth = "82px";

      return {
        address: {
          showNarrow: true,
          filterable: true,
          sortable: true,
          title: this.knx.localize("project_view_table_address"),
          flex: 1,
          minWidth: addressWidth,
          direction: "asc",
        },
        name: {
          showNarrow: true,
          filterable: true,
          sortable: true,
          title: this.knx.localize("project_view_table_name"),
          flex: 3,
        },
        dpt_raw: {
          showNarrow: true,
          defaultHidden: narrow,
          sortable: true,
          filterable: true,
          groupable: true,
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
          showNarrow: true,
          filterable: false, // template result value isn't filterable or sortable
          sortable: false,
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
          showNarrow: true,
          defaultHidden: narrow,
          filterable: false, // template result value isn't filterable or sortable
          sortable: false,
          title: this.knx.localize("project_view_table_updated"),
          flex: 1,
          template: (ga: GroupAddress) => {
            const lastTelegram: TelegramDict | undefined = this._lastTelegrams[ga.address];
            if (!lastTelegram) return "";
            const tooltip = `${TelegramDictFormatter.dateWithMilliseconds(lastTelegram)}\n\n${lastTelegram.source} ${lastTelegram.source_name}`;
            return html`<div title=${tooltip}>
              ${relativeTime(new Date(lastTelegram.timestamp), this.hass.locale)}
            </div>`;
          },
        },
        actions: {
          showNarrow: true,
          defaultHidden: narrow,
          title: "",
          type: "overflow-menu",
          template: (ga: GroupAddress) => this._groupAddressMenu(ga),
        },
      };
    },
  );

  private _groupAddressMenu(groupAddress: GroupAddress): TemplateResult {
    const items: IconOverflowMenuItem[] = [];

    // Add menu item to view telegrams for this group address
    items.push({
      path: mdiMathLog,
      label: this.knx.localize("project_view_menu_view_telegrams"),
      action: () => {
        navigate(`/knx/group_monitor?destination=${groupAddress.address}`);
      },
    });

    if (groupAddress.dpt) {
      if (groupAddress.dpt.main === 1) {
        items.push({
          path: mdiPlus,
          label: this.knx.localize("project_view_menu_create_binary_sensor"),
          action: () => {
            navigate(
              "/knx/entities/create/binary_sensor?knx.ga_sensor.state=" + groupAddress.address,
            );
          },
        });
      } else if (dptInClasses(groupAddress.dpt, ["numeric", "string"], this.knx.dptMetadata)) {
        items.push({
          path: mdiPlus,
          label: this.knx.localize("project_view_menu_create_sensor") ?? "Create Sensor",
          action: () => {
            const dptString = groupAddress.dpt
              ? `${groupAddress.dpt.main}${groupAddress.dpt.sub !== null ? "." + groupAddress.dpt.sub.toString().padStart(3, "0") : ""}`
              : "";
            navigate(
              `/knx/entities/create/sensor?knx.ga_sensor.state=${groupAddress.address}` +
                `${dptString ? `&knx.ga_sensor.dpt=${dptString}` : ""}`,
            );
          },
        });
      }
    }
    return html`
      <ha-icon-overflow-menu .hass=${this.hass} narrow .items=${items}> </ha-icon-overflow-menu>
    `;
  }

  private _getRows = memoize(
    (
      visibleGroupAddresses: string[],
      groupAddresses: Record<string, GroupAddress>,
    ): (GroupAddress & { dpt_raw: string })[] => {
      const filtered = !visibleGroupAddresses.length
        ? // if none is set, default to show all
          Object.values(groupAddresses)
        : visibleGroupAddresses
            .map((key) => groupAddresses[key])
            .filter((ga): ga is GroupAddress => !!ga);
      return filtered.map((ga) => ({ ...ga, dpt_raw: dptToString(ga.dpt) }));
    },
  );

  private _visibleAddressesChanged(ev: HASSDomEvent<GroupRangeSelectionChangedEvent>) {
    this._visibleGroupAddresses = ev.detail.groupAddresses;
  }

  protected render(): TemplateResult {
    return this._projectLoadTask.render({
      initial: () => html`
        <hass-loading-screen .message=${"Waiting to fetch project data."}></hass-loading-screen>
      `,
      pending: () => html`
        <hass-loading-screen .message=${"Loading KNX project data."}></hass-loading-screen>
      `,
      error: (err) => {
        logger.error("Error loading KNX project", err);
        return this._renderError("error", "Error loading KNX project");
      },
      complete: () =>
        this.knx.projectData
          ? this._renderTable(this.knx.projectData)
          : this._renderError("info", this.knx.localize("project_view_upload")),
    });
  }

  private _renderError(alertType: "error" | "info", message: string): TemplateResult {
    return html` <hass-tabs-subpage .narrow=${this.narrow} .hass=${this.hass} .tabs=${[projectTab]}
      ><ha-alert alert-type=${alertType}> ${message} </ha-alert></hass-tabs-subpage
    >`;
  }

  private _renderTable(projectData: KNXProject): TemplateResult {
    const filtered = this._getRows(this._visibleGroupAddresses, projectData.group_addresses);

    return html` <hass-tabs-subpage-data-table
      .hass=${this.hass}
      .narrow=${this.narrow}
      .route=${this.route}
      .tabs=${[projectTab]}
      .localizeFunc=${this.hass.localize}
      .columns=${this._columns(this.narrow, this.hass.language)}
      .data=${filtered as DataTableRowData[]}
      .hasFab=${false}
      .searchLabel=${this.hass.localize("ui.components.data-table.search")}
      .clickable=${false}
      .hasFilters=${this._groupRangeAvailable}
      .filters=${this._visibleGroupAddresses.length}
      @columns-changed=${this._handleColumnsChanged}
      .columnOrder=${this.narrow
        ? this._storedColumns?.narrow?.columnOrder
        : this._storedColumns?.wide?.columnOrder}
      .hiddenColumns=${this.narrow
        ? this._storedColumns?.narrow?.hiddenColumns
        : this._storedColumns?.wide?.hiddenColumns}
    >
      ${this._groupRangeAvailable
        ? html`
            <knx-project-tree-view
              slot="filter-pane"
              .data=${projectData}
              @knx-group-range-selection-changed=${this._visibleAddressesChanged}
            ></knx-project-tree-view>
          `
        : nothing}
    </hass-tabs-subpage-data-table>`;
  }

  private _handleColumnsChanged(
    ev: HASSDomEvent<{ columnOrder?: string[]; hiddenColumns?: string[] }>,
  ) {
    const { columnOrder, hiddenColumns } = ev.detail;
    const prev = this._storedColumns ?? {};
    this._storedColumns = {
      ...prev,
      [this.narrow ? "narrow" : "wide"]: { columnOrder, hiddenColumns },
    };
  }

  static styles = css`
    hass-loading-screen {
      --app-header-background-color: var(--sidebar-background-color);
      --app-header-text-color: var(--sidebar-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-view": KNXProjectView;
  }
}
