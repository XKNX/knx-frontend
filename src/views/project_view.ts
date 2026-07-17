import {
  mdiPlus,
  mdiMathLog,
  mdiClose,
  mdiFilterVariant,
  mdiFilterVariantRemove,
  mdiNetworkOutline,
  mdiTableLarge,
  mdiUnfoldLessHorizontal,
  mdiUnfoldMoreHorizontal,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { consume } from "@lit/context";

import memoize from "memoize-one";

import { storage } from "@ha/common/decorators/storage";
import type { HASSDomEvent } from "@ha/common/dom/fire_event";
import { navigate } from "@ha/common/navigate";
import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage";
import "@ha/layouts/hass-tabs-subpage-data-table";
import "@ha/components/ha-alert";
import "@ha/components/ha-button";
import "@ha/components/ha-button-toggle-group";
import "@ha/components/ha-dialog";
import "@ha/components/ha-dialog-footer";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-icon-overflow-menu";
import "@ha/components/ha-svg-icon";
import "@ha/components/chips/ha-assist-chip";
import "@ha/components/input/ha-input-search";
import type { HaInputSearch } from "@ha/components/input/ha-input-search";
import type {
  DataTableColumnContainer,
  DataTableRowData,
} from "@ha/components/data-table/ha-data-table";
import type { IconOverflowMenuItem } from "@ha/components/ha-icon-overflow-menu";
import { relativeTime } from "@ha/common/datetime/relative_time";

import "../components/knx-project-tree-view";
import "../components/knx-project-devices-view";
import "../components/data-table/knx-data-table-related-label";
import "../components/data-table/filter/knx-list-filter";

import { compare } from "compare-versions";

import type { HomeAssistant, Route, ToggleButton } from "@ha/types";
import { dptInClasses, dptToString } from "utils/dpt";
import type {
  SelectionChangedEvent as ListFilterSelectionChangedEvent,
  ExpandedChangedEvent as ListFilterExpandedChangedEvent,
  Config as ListFilterConfig,
} from "../components/data-table/filter/knx-list-filter";
import type { KNXProjectDevicesView } from "../components/knx-project-devices-view";
import {
  buildDeviceTree,
  filterDeviceTree,
  getDptFilterOptions,
  getLineByDevice,
  getLineFilterOptions,
  getLocationByDevice,
  getLocationFilterOptions,
  hasDeviceTreeFilterActive,
} from "../utils/project-structure";
import type { DeviceFilterOption, DeviceTreeItem } from "../utils/project-structure";
import { createExposesByGroupAddressMap } from "../data/exposes-by-group";
import { exposeGroupsContext } from "../data/knx-expose-groups-context";
import type { ExposeGroupsContextValue } from "../data/knx-expose-groups-context";
import { entitiesByGroupContext } from "../data/knx-entities-by-group-context";
import type { EntitiesByGroupContextValue } from "../data/knx-entities-by-group-context";
import { knxProjectContext } from "../data/knx-project-context";
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

type ProjectViewMode = "group_addresses" | "devices";

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

  @state()
  @consume({ context: knxProjectContext, subscribe: true })
  private _projectData: KNXProject | null = null;

  @state()
  @consume({ context: exposeGroupsContext, subscribe: true })
  private _exposeGroupsCtx: ExposeGroupsContextValue | null = null;

  @state()
  @consume({ context: entitiesByGroupContext, subscribe: true })
  private _entitiesByGroupCtx: EntitiesByGroupContextValue | null = null;

  @storage({
    key: "knx-project-view-columns",
    state: false,
    subscribe: false,
  })
  private _storedColumns?: {
    wide?: { columnOrder?: string[]; hiddenColumns?: string[] };
    narrow?: { columnOrder?: string[]; hiddenColumns?: string[] };
  };

  @storage({
    key: "knx-project-view-mode",
    state: true,
    subscribe: false,
  })
  private _viewMode: ProjectViewMode = "group_addresses";

  @state() private _devicesShowFilters = false;

  @state() private _devicesSearchText = "";

  @query("knx-project-devices-view") private _devicesView?: KNXProjectDevicesView;

  @state() private _devicesExpandedFilter: "dpt" | "location" | "line" | null = "dpt";

  @state() private _devicesFilterDpt: string[] = [];

  @state() private _devicesFilterLocation: string[] = [];

  @state() private _devicesFilterLine: string[] = [];

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

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("_projectData")) {
      this._isGroupRangeAvailable(this._projectData);
    }
  }

  private _isGroupRangeAvailable(projectData: KNXProject | null): void {
    const projectVersion = projectData?.info.xknxproject_version ?? "0.0.0";
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
    (
      narrow,
      _language,
    ): DataTableColumnContainer<
      GroupAddress & {
        dpt_raw: string;
        related_exposes: string[];
        related_entities: string[];
        related_entities_yaml: string[];
      }
    > => {
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
        related: {
          showNarrow: true,
          defaultHidden: narrow,
          filterable: false, // template result value isn't filterable or sortable
          sortable: false,
          title: this.hass.localize("ui.dialogs.entity_registry.related"),
          flex: 2,
          template: (ga) =>
            ga.related_entities.length ||
            ga.related_entities_yaml.length ||
            ga.related_exposes.length
              ? html`<knx-data-table-related-label
                  .hass=${this.hass}
                  .entities=${ga.related_entities}
                  .entitiesYaml=${ga.related_entities_yaml}
                  .exposes=${ga.related_exposes}
                ></knx-data-table-related-label>`
              : nothing,
        },
        related_entities: {
          hidden: true,
          filterable: true,
          sortable: false,
          title: "Entities",
        },
        related_entities_yaml: {
          hidden: true,
          filterable: true,
          sortable: false,
          title: "Entities",
        },
        related_exposes: {
          hidden: true,
          filterable: true,
          sortable: false,
          title: "Exposes",
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
      exposeGroups: Record<string, string[]> | null,
      entitiesByGroup: EntitiesByGroupContextValue["groups"] | null,
    ): (GroupAddress & {
      dpt_raw: string;
      related_exposes: string[];
      related_entities: string[];
      related_entities_yaml: string[];
    })[] => {
      const exposesByGA = exposeGroups ? createExposesByGroupAddressMap(exposeGroups) : null;
      const filtered = !visibleGroupAddresses.length
        ? // if none is set, default to show all
          Object.values(groupAddresses)
        : visibleGroupAddresses
            .map((key) => groupAddresses[key])
            .filter((ga): ga is GroupAddress => !!ga);
      return filtered.map((ga) => ({
        ...ga,
        dpt_raw: dptToString(ga.dpt),
        related_exposes: exposesByGA?.[ga.address] ?? [],
        related_entities: entitiesByGroup?.[ga.address]?.ui ?? [],
        related_entities_yaml: entitiesByGroup?.[ga.address]?.yaml ?? [],
      }));
    },
  );

  private _visibleAddressesChanged(ev: HASSDomEvent<GroupRangeSelectionChangedEvent>) {
    this._visibleGroupAddresses = ev.detail.groupAddresses;
  }

  protected render(): TemplateResult {
    if (!this.knx.projectInfo) {
      return this._renderError("info", this.knx.localize("project_view_upload"));
    }
    if (!this._projectData) {
      return html`
        <hass-loading-screen .message=${"Loading KNX project data."}></hass-loading-screen>
      `;
    }
    return this._viewMode === "devices"
      ? this._renderDevices(this._projectData)
      : this._renderTable(this._projectData);
  }

  private _viewToggleButtons = memoize((narrow: boolean, _language: string): ToggleButton[] => [
    {
      value: "group_addresses",
      // ha-button-toggle-group renders either the icon or the label text
      ...(narrow ? { iconPath: mdiTableLarge } : {}),
      label: this.hass.localize("component.knx.config_panel.common.group_addresses"),
    },
    {
      value: "devices",
      ...(narrow ? { iconPath: mdiNetworkOutline } : {}),
      label: this.hass.localize("component.knx.config_panel.project.devices.title"),
    },
  ]);

  private _renderViewToggle(): TemplateResult {
    return html`<ha-button-toggle-group
      slot="toolbar-icon"
      size="s"
      variant="neutral"
      .buttons=${this._viewToggleButtons(this.narrow, this.hass.language)}
      .active=${this._viewMode}
      @value-changed=${this._viewModeChanged}
    ></ha-button-toggle-group>`;
  }

  private _viewModeChanged(ev: HASSDomEvent<{ value?: string }>): void {
    if (!ev.detail.value || ev.detail.value === this._viewMode) {
      return;
    }
    this._viewMode = ev.detail.value as ProjectViewMode;
  }

  private _renderError(alertType: "error" | "info", message: string): TemplateResult {
    return html` <hass-tabs-subpage .narrow=${this.narrow} .hass=${this.hass} .tabs=${[projectTab]}
      ><ha-alert alert-type=${alertType}> ${message} </ha-alert></hass-tabs-subpage
    >`;
  }

  private _renderTable(projectData: KNXProject): TemplateResult {
    const filtered = this._getRows(
      this._visibleGroupAddresses,
      projectData.group_addresses,
      this._exposeGroupsCtx?.groups ?? null, // pass null when groups are unavailable to stabilize memoize inputs
      this._entitiesByGroupCtx?.groups ?? null,
    );

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
      ${this._renderViewToggle()}
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

  private _devicesTree = memoize((projectData: KNXProject): DeviceTreeItem[] =>
    buildDeviceTree(projectData),
  );

  private _locationByDevice = memoize(getLocationByDevice);

  private _lineByDevice = memoize((projectData: KNXProject) =>
    getLineByDevice(
      projectData.topology ?? null,
      Object.values(projectData.devices).map((device) => device.individual_address),
    ),
  );

  private _dptFilterOptions = memoize(
    (deviceTree: DeviceTreeItem[], dptMetadata: KNX["dptMetadata"]): DeviceFilterOption[] =>
      getDptFilterOptions(deviceTree).map((option) => ({
        ...option,
        secondary: dptMetadata[option.id]?.name ?? undefined,
      })),
  );

  private _locationFilterOptions = memoize(
    (locationByDevice: ReturnType<typeof getLocationByDevice>) =>
      getLocationFilterOptions(locationByDevice),
  );

  private _lineFilterOptions = memoize((lineByDevice: ReturnType<typeof getLineByDevice>) =>
    getLineFilterOptions(lineByDevice),
  );

  private _deviceFilterConfig = memoize(
    (_language: string): ListFilterConfig<DeviceFilterOption> => ({
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DeviceFilterOption) => item.id,
      },
      primaryField: {
        fieldName: this.knx.localize("project_view_table_name"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DeviceFilterOption) => item.name,
      },
      secondaryField: {
        filterable: true,
        sortable: false,
        mapper: (item: DeviceFilterOption) => item.secondary,
      },
      badgeField: {
        filterable: false,
        sortable: false,
        mapper: (item: DeviceFilterOption) => String(item.count),
      },
    }),
  );

  private get _devicesActiveFilterCount(): number {
    return [this._devicesFilterDpt, this._devicesFilterLocation, this._devicesFilterLine].filter(
      (filter) => filter.length,
    ).length;
  }

  private _toggleDevicesFilters(): void {
    this._devicesShowFilters = !this._devicesShowFilters;
  }

  private _closeDevicesFilters(): void {
    this._devicesShowFilters = false;
  }

  private _clearDevicesFilters(): void {
    this._devicesFilterDpt = [];
    this._devicesFilterLocation = [];
    this._devicesFilterLine = [];
  }

  private _devicesDptSelectionChanged(ev: HASSDomEvent<ListFilterSelectionChangedEvent>): void {
    this._devicesFilterDpt = ev.detail.value;
  }

  private _devicesLocationSelectionChanged(
    ev: HASSDomEvent<ListFilterSelectionChangedEvent>,
  ): void {
    this._devicesFilterLocation = ev.detail.value;
  }

  private _devicesLineSelectionChanged(ev: HASSDomEvent<ListFilterSelectionChangedEvent>): void {
    this._devicesFilterLine = ev.detail.value;
  }

  private _devicesFilterExpandedChanged(ev: HASSDomEvent<ListFilterExpandedChangedEvent>): void {
    const filterId = (ev.currentTarget as HTMLElement).getAttribute("data-filter") as
      | "dpt"
      | "location"
      | "line";
    if (ev.detail.expanded) {
      this._devicesExpandedFilter = filterId;
    } else if (this._devicesExpandedFilter === filterId) {
      this._devicesExpandedFilter = null;
    }
  }

  private _renderDevicesFilters(projectData: KNXProject): TemplateResult {
    const config = this._deviceFilterConfig(this.hass.language);
    const deviceTree = this._devicesTree(projectData);
    return html`
      <knx-list-filter
        data-filter="dpt"
        .hass=${this.hass}
        .knx=${this.knx}
        .data=${this._dptFilterOptions(deviceTree, this.knx.dptMetadata)}
        .config=${config}
        .selectedOptions=${this._devicesFilterDpt}
        .expanded=${this._devicesExpandedFilter === "dpt"}
        .narrow=${this.narrow}
        .filterTitle=${this.knx.localize("telegram_filter_dpt_title")}
        @selection-changed=${this._devicesDptSelectionChanged}
        @expanded-changed=${this._devicesFilterExpandedChanged}
      ></knx-list-filter>
      ${projectData.locations
        ? html`<knx-list-filter
            data-filter="location"
            .hass=${this.hass}
            .knx=${this.knx}
            .data=${this._locationFilterOptions(
              this._locationByDevice(projectData.locations ?? null),
            )}
            .config=${config}
            .selectedOptions=${this._devicesFilterLocation}
            .expanded=${this._devicesExpandedFilter === "location"}
            .narrow=${this.narrow}
            .filterTitle=${this.hass.localize(
              "component.knx.config_panel.project.devices.locations",
            )}
            @selection-changed=${this._devicesLocationSelectionChanged}
            @expanded-changed=${this._devicesFilterExpandedChanged}
          ></knx-list-filter>`
        : nothing}
      <knx-list-filter
        data-filter="line"
        .hass=${this.hass}
        .knx=${this.knx}
        .data=${this._lineFilterOptions(this._lineByDevice(projectData))}
        .config=${config}
        .selectedOptions=${this._devicesFilterLine}
        .expanded=${this._devicesExpandedFilter === "line"}
        .narrow=${this.narrow}
        .filterTitle=${this.hass.localize("component.knx.config_panel.project.devices.lines")}
        @selection-changed=${this._devicesLineSelectionChanged}
        @expanded-changed=${this._devicesFilterExpandedChanged}
      ></knx-list-filter>
    `;
  }

  private _devicesFilteredCount = memoize(
    (
      projectData: KNXProject,
      searchText: string,
      dpt: string[],
      location: string[],
      line: string[],
    ): number =>
      filterDeviceTree(
        this._devicesTree(projectData),
        { searchText, dpt, location, line },
        this._locationByDevice(projectData.locations ?? null),
        this._lineByDevice(projectData),
      ).length,
  );

  private _devicesSearchChanged(ev: Event): void {
    this._devicesSearchText = (ev.target as HaInputSearch).value ?? "";
  }

  private _devicesExpandAll(): void {
    this._devicesView?.expandAll();
  }

  private _devicesCollapseAll(): void {
    this._devicesView?.collapseAll();
  }

  private _renderDevicesSearch(): TemplateResult {
    return html`<ha-input-search
      appearance="outlined"
      .value=${this._devicesSearchText}
      @input=${this._devicesSearchChanged}
    ></ha-input-search>`;
  }

  private _renderDevicesToolbar(
    projectData: KNXProject,
    activeFilterCount: number,
  ): TemplateResult {
    const filterActive = hasDeviceTreeFilterActive({
      searchText: this._devicesSearchText,
      dpt: this._devicesFilterDpt,
      location: this._devicesFilterLocation,
      line: this._devicesFilterLine,
    });
    const filterButton = !(this._devicesShowFilters && !this.narrow)
      ? html`<div class="relative">
          <ha-assist-chip
            .label=${this.hass.localize("ui.components.subpage-data-table.filters")}
            .active=${activeFilterCount > 0}
            @click=${this._toggleDevicesFilters}
          >
            <ha-svg-icon slot="icon" .path=${mdiFilterVariant}></ha-svg-icon>
          </ha-assist-chip>
          ${activeFilterCount ? html`<div class="badge">${activeFilterCount}</div>` : nothing}
        </div>`
      : nothing;
    return html`<div class="devices-toolbar">
      ${filterButton} ${!this.narrow ? this._renderDevicesSearch() : nothing}
      ${filterActive
        ? html`<span class="result-count">
            ${this.hass.localize("ui.components.data-table.hidden", {
              number:
                this._devicesTree(projectData).length -
                this._devicesFilteredCount(
                  projectData,
                  this._devicesSearchText,
                  this._devicesFilterDpt,
                  this._devicesFilterLocation,
                  this._devicesFilterLine,
                ),
            })}
          </span>`
        : nothing}
      <ha-icon-button
        .path=${mdiUnfoldMoreHorizontal}
        .label=${this.hass.localize("ui.components.subpage-data-table.expand_all_groups")}
        @click=${this._devicesExpandAll}
      ></ha-icon-button>
      <ha-icon-button
        .path=${mdiUnfoldLessHorizontal}
        .label=${this.hass.localize("ui.components.subpage-data-table.collapse_all_groups")}
        @click=${this._devicesCollapseAll}
      ></ha-icon-button>
    </div>`;
  }

  private _renderDevices(projectData: KNXProject): TemplateResult {
    const activeFilterCount = this._devicesActiveFilterCount;
    const showPane = this._devicesShowFilters && !this.narrow;
    const exposesByGA = this._exposeGroupsCtx?.groups
      ? createExposesByGroupAddressMap(this._exposeGroupsCtx.groups)
      : null;
    return html`<hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        .tabs=${[projectTab]}
        .pane=${showPane}
      >
        ${this._renderViewToggle()}
        ${this.narrow
          ? html`<div slot="header" class="search-toolbar">${this._renderDevicesSearch()}</div>`
          : nothing}
        ${showPane
          ? html`<div class="filter-pane" slot="pane">
              <div class="filter-pane-header">
                <ha-assist-chip
                  .label=${this.hass.localize("ui.components.subpage-data-table.filters")}
                  active
                  @click=${this._toggleDevicesFilters}
                >
                  <ha-svg-icon slot="icon" .path=${mdiFilterVariant}></ha-svg-icon>
                </ha-assist-chip>
                ${activeFilterCount
                  ? html`<ha-icon-button
                      .path=${mdiFilterVariantRemove}
                      .label=${this.hass.localize("ui.components.subpage-data-table.clear_filter")}
                      @click=${this._clearDevicesFilters}
                    ></ha-icon-button>`
                  : nothing}
              </div>
              <div class="filter-pane-content">${this._renderDevicesFilters(projectData)}</div>
            </div>`
          : nothing}
        <div class="devices-layout">
          ${this._renderDevicesToolbar(projectData, activeFilterCount)}
          <knx-project-devices-view
            .hass=${this.hass}
            .knx=${this.knx}
            .data=${projectData}
            .lastTelegrams=${this._lastTelegrams}
            .narrow=${this.narrow}
            .searchText=${this._devicesSearchText}
            .filterDpt=${this._devicesFilterDpt}
            .filterLocation=${this._devicesFilterLocation}
            .filterLine=${this._devicesFilterLine}
            .locationByDevice=${this._locationByDevice(projectData.locations ?? null)}
            .lineByDevice=${this._lineByDevice(projectData)}
            .entitiesByGroup=${this._entitiesByGroupCtx?.groups ?? null}
            .exposesByGA=${exposesByGA}
          ></knx-project-devices-view>
        </div>
      </hass-tabs-subpage>
      ${this._devicesShowFilters && this.narrow
        ? html`<ha-dialog
            .open=${true}
            width="full"
            header-title=${this.hass.localize("ui.components.subpage-data-table.filters")}
            @closed=${this._closeDevicesFilters}
          >
            <ha-icon-button
              slot="headerNavigationIcon"
              .path=${mdiClose}
              .label=${this.hass.localize("ui.components.subpage-data-table.close_filter")}
              @click=${this._closeDevicesFilters}
            ></ha-icon-button>
            ${activeFilterCount
              ? html`<ha-icon-button
                  slot="headerActionItems"
                  .path=${mdiFilterVariantRemove}
                  .label=${this.hass.localize("ui.components.subpage-data-table.clear_filter")}
                  @click=${this._clearDevicesFilters}
                ></ha-icon-button>`
              : nothing}
            <div class="filter-dialog-content">${this._renderDevicesFilters(projectData)}</div>
            <ha-dialog-footer slot="footer">
              <ha-button slot="primaryAction" @click=${this._closeDevicesFilters}>
                ${this.hass.localize("ui.common.close")}
              </ha-button>
            </ha-dialog-footer>
          </ha-dialog>`
        : nothing}`;
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

    .devices-layout {
      display: flex;
      flex-direction: column;
      height: calc(
        100vh -
          1px - var(--header-height, 0px) - var(--safe-area-inset-top, 0px) - var(
            --safe-area-inset-bottom,
            0px
          )
      );
    }

    .devices-layout > knx-project-devices-view {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      /* establish a stacking context so the sticky device headers (z-index: 2)
         stay contained here; otherwise an ancestor paints them above this
         scroller and they hide the overlay scrollbar, which has no layout
         width of its own and floats over the cards' right edge */
      isolation: isolate;
    }

    /* mirrors the .table-header of hass-tabs-subpage-data-table */
    .devices-toolbar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      height: 56px;
      width: 100%;
      padding: 0 16px;
      gap: var(--ha-space-4, 16px);
      box-sizing: border-box;
      background: var(--primary-background-color);
      border-bottom: 1px solid var(--divider-color);
    }

    .devices-toolbar ha-input-search {
      flex: 1;
    }

    @media (min-width: 871px) {
      .devices-toolbar ha-input-search {
        --ha-input-search-height: 32px;
        --ha-input-search-border-radius: 10px;
      }
    }

    ha-assist-chip {
      --ha-assist-chip-container-shape: 10px;
      --ha-assist-chip-container-color: var(--card-background-color);
    }

    .devices-toolbar ha-icon-button {
      color: var(--secondary-text-color);
    }

    :host([narrow]) hass-tabs-subpage {
      /* same as hass-tabs-subpage-data-table so the search field
         doesn't jump when switching between the two view modes */
      --main-title-margin: 0;
    }

    :host([narrow]) ha-button-toggle-group {
      /* small gap between the search field and the view toggle */
      margin-inline-start: 4px;
    }

    .search-toolbar {
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
      color: var(--secondary-text-color);
    }

    .search-toolbar ha-input-search {
      flex: 1;
      min-width: 0;
    }

    .result-count {
      flex: 0 0 auto;
      font-size: 0.85rem;
      color: var(--secondary-text-color);
    }

    .relative {
      position: relative;
    }

    .badge {
      position: absolute;
      top: -4px;
      right: -4px;
      inset-inline-end: -4px;
      inset-inline-start: initial;
      min-width: 16px;
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-circle, 50%);
      font-size: var(--ha-font-size-xs, 11px);
      font-weight: var(--ha-font-weight-normal, 400);
      background-color: var(--primary-color);
      line-height: var(--ha-line-height-normal, 1.4);
      text-align: center;
      padding: 0 2px;
      color: var(--text-primary-color);
      pointer-events: none;
    }

    .filter-pane {
      display: flex;
      flex-direction: column;
      height: calc(
        100vh -
          1px - var(--header-height, 0px) - var(--safe-area-inset-top, 0px) - var(
            --safe-area-inset-bottom,
            0px
          )
      );
    }

    .filter-pane-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-sizing: border-box;
      height: var(--header-height, 56px);
      flex: 0 0 auto;
      padding: 0 12px;
      border-bottom: 1px solid var(--divider-color);
    }

    .filter-pane-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .filter-dialog-content {
      height: calc(100vh - 1px - 61px - var(--header-height, 0px));
      display: flex;
      flex-direction: column;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-view": KNXProjectView;
  }
}
