import { css, html, LitElement, nothing } from "lit";
import type { CSSResultGroup, TemplateResult } from "lit";

import memoize from "memoize-one";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage-data-table";
import "@ha/components/ha-alert";
import "@ha/components/ha-button";
import type { HASSDomEvent } from "@ha/common/dom/fire_event";
import type {
  DataTableColumnContainer,
  RowClickedEvent,
  SortingChangedEvent,
} from "@ha/components/data-table/ha-data-table";
import "@ha/components/ha-icon-button";
import type { HomeAssistant, Route } from "@ha/types";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import { isMobileClient } from "@ha/util/is_mobile";
import { isTouch } from "@ha/util/is_touch";

import "../../../components/data-table/cell/knx-table-cell";
import "../../../components/data-table/cell/knx-table-cell-filterable";
import "../dialogs/telegram-info-dialog";
import "../../../components/data-table/filter/knx-list-filter";

import { customElement, property, query } from "lit/decorators";
import { storage } from "@ha/common/decorators/storage";
import { mdiDeleteSweep, mdiFastForward, mdiPause, mdiRefresh } from "@mdi/js";
import { formatTimeWithMilliseconds, formatTimeDelta } from "../../../utils/format";
import type { TelegramRow, TelegramRowKeys } from "../types/telegram-row";
import type { ToggleFilterEvent } from "../../../components/data-table/cell/knx-table-cell-filterable";
import { GroupMonitorController } from "../controller/group-monitor-controller";
import type { DistinctValueInfo } from "../controller/group-monitor-controller";
import { groupMonitorTab } from "../../../knx-router";

import type { KNX } from "../../../types/knx";
import type {
  SelectionChangedEvent as ListFilterSelectionChangedEvent,
  ExpandedChangedEvent as ListFilterExpandedChangedEvent,
  Config as ListFilterConfig,
  KnxListFilter,
} from "../../../components/data-table/filter/knx-list-filter";

/**
 * KNX Group Monitor Component
 *
 * A real-time monitoring interface for KNX telegrams that provides:
 * - Live telegram streaming with pause/resume functionality
 * - Advanced filtering by source, destination, direction, and telegram type
 * - Sortable data table with detailed telegram information
 * - Navigation between telegrams with detailed view dialog
 * - Historical telegram loading and management
 * - Ring buffer storage with dynamic limit based on recent telegrams plus buffer
 * - Smart refresh that merges new telegrams with existing cache (no data loss)
 * - URL-based filtering for deep linking and to persist filter combinations
 *
 * ## URL Filter Parameters
 *
 * The component supports URL-based filtering:
 *
 * - `?source=1.2.3,4.5.6` - Filter by source addresses (comma-separated)
 * - `?destination=1/2/3,4/5/6` - Filter by destination addresses (comma-separated)
 * - `?direction=Incoming` - Filter by telegram direction (comma-separated)
 * - `?telegramtype=GroupValueWrite,GroupValueRead` - Filter by telegram types (comma-separated)
 *
 * **Examples:**
 * ```
 * /knx/group_monitor?source=1.1.1&destination=2/3/4
 * /knx/group_monitor?direction=Incoming&telegramtype=GroupValueWrite
 * /knx/group_monitor?source=1.2.3,1.2.4&destination=5/6/7
 * ```
 */
@customElement("knx-group-monitor")
export class KNXGroupMonitor extends LitElement {
  // Static definitions
  static get styles(): CSSResultGroup {
    return [
      css`
        :host {
          --table-row-alternative-background-color: var(--primary-background-color);
        }

        ha-icon-button.active {
          color: var(--primary-color);
        }

        .table-header {
          border-bottom: 1px solid var(--divider-color);
          padding-bottom: 12px;
        }

        :host {
          --ha-data-table-row-style: {
            font-size: 0.9em;
            padding: 8px 0;
          };
        }

        .filter-wrapper {
          display: flex;
          flex-direction: column;
        }

        .toolbar-actions {
          padding-left: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `,
    ];
  }

  /** Home Assistant instance for API communication */
  @property({ type: Object }) public hass!: HomeAssistant;

  /** KNX integration instance providing localization and configuration */
  @property({ attribute: false }) public knx!: KNX;

  /** Whether the UI is in narrow/mobile layout mode */
  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  /** Current route information */
  @property({ type: Object }) public route?: Route;

  /** Navigation tabs configuration */
  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  @storage({
    key: "knx-group-monitor-columns",
    state: false,
    subscribe: false,
  })
  private _storedColumns?: {
    wide?: { columnOrder?: string[]; hiddenColumns?: string[] };
    narrow?: { columnOrder?: string[]; hiddenColumns?: string[] };
  };

  /** GroupMonitor controller instance */
  private controller = new GroupMonitorController(this);

  /** Reference to source filter component */
  @query('knx-list-filter[data-filter="source"]') private sourceFilter?: KnxListFilter;

  /** Reference to destination filter component */
  @query('knx-list-filter[data-filter="destination"]') private destinationFilter?: KnxListFilter;

  /**
   * Detects if the current device is a mobile touch device
   * Used to disable quick filter buttons on mobile for better UX
   */
  private get isMobileTouchDevice(): boolean {
    return isMobileClient && isTouch;
  }

  /**
   * Gets both filtered telegrams and distinct values in a single call to avoid update loops
   */
  private _getFilteredData() {
    return this.controller.getFilteredTelegramsAndDistinctValues();
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Component initialization - loads recent telegrams and establishes WebSocket connection
   * Called once when the component is first rendered
   */
  public async firstUpdated(): Promise<void> {
    await this.controller.setup(this.hass);
  }

  /**
   * Localized search label showing telegram count
   * Adapts based on narrow layout and singular/plural forms
   */
  private get searchLabel(): string {
    if (this.narrow) {
      return this.knx.localize("group_monitor_search_label_narrow");
    }
    const { filteredTelegrams } = this._getFilteredData();
    const count = filteredTelegrams.length;
    const key = count === 1 ? "group_monitor_search_label_singular" : "group_monitor_search_label";
    return this.knx.localize(key, { count });
  }

  // ============================================================================
  // Filter Configurations
  // ============================================================================

  /**
   * Checks if any filters are currently active
   * @param filterField - Optional specific filter field to check (e.g., 'source', 'destination', 'direction', 'telegramtype')
   * @returns True if filters are active (either any filter or the specified filter field)
   */
  private _hasActiveFilters(filterField?: string): boolean {
    if (filterField) {
      const filter = this.controller.filters[filterField];
      return Array.isArray(filter) && filter.length > 0;
    }
    return Object.values(this.controller.filters).some((f) => Array.isArray(f) && f.length > 0);
  }

  /**
   * Memoized configuration for source address filter
   */
  private _sourceFilterConfig = memoize(
    (
      hasActiveFilters: boolean,
      sourceFiltersLength: number,
      sourceFilterSortCriterion: string | undefined,
      _language: string,
    ): ListFilterConfig<DistinctValueInfo> => ({
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      primaryField: {
        fieldName: this.knx.localize("telegram_filter_source_sort_by_primaryText"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DistinctValueInfo) => item.id,
      },
      secondaryField: {
        fieldName: this.knx.localize("telegram_filter_source_sort_by_secondaryText"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DistinctValueInfo) => item.name,
      },
      badgeField: {
        fieldName: this.knx.localize("telegram_filter_source_sort_by_badge"),
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) =>
          hasActiveFilters ? `${item.filteredCount}/${item.totalCount}` : `${item.totalCount}`,
      },
      custom: {
        totalCount: {
          fieldName: this.knx.localize("telegram_filter_sort_by_total_count"),
          filterable: false,
          sortable: true,
          sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
          sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
          sortDefaultDirection: "desc",
          mapper: (item: DistinctValueInfo) => item.totalCount.toString(),
        },
        filteredCount: {
          fieldName: this.knx.localize("telegram_filter_sort_by_filtered_count"),
          filterable: false,
          sortable: sourceFiltersLength > 0 || sourceFilterSortCriterion === "filteredCount",
          sortDisabled: sourceFiltersLength === 0,
          sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
          sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
          sortDefaultDirection: "desc",
          mapper: (item: DistinctValueInfo) => (item.filteredCount || 0).toString(),
        },
      },
    }),
  );

  /**
   * Memoized configuration for destination address filter
   */
  private _destinationFilterConfig = memoize(
    (
      hasActiveFilters: boolean,
      destinationFiltersLength: number,
      destinationFilterSortCriterion: string | undefined,
      _language: string,
    ): ListFilterConfig<DistinctValueInfo> => ({
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      primaryField: {
        fieldName: this.knx.localize("telegram_filter_destination_sort_by_primaryText"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DistinctValueInfo) => item.id,
      },
      secondaryField: {
        fieldName: this.knx.localize("telegram_filter_destination_sort_by_secondaryText"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DistinctValueInfo) => item.name,
      },
      badgeField: {
        fieldName: this.knx.localize("telegram_filter_destination_sort_by_badge"),
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) =>
          hasActiveFilters ? `${item.filteredCount}/${item.totalCount}` : `${item.totalCount}`,
      },
      custom: {
        totalCount: {
          fieldName: this.knx.localize("telegram_filter_sort_by_total_count"),
          filterable: false,
          sortable: true,
          sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
          sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
          sortDefaultDirection: "desc",
          mapper: (item: DistinctValueInfo) => item.totalCount.toString(),
          // Removed custom comparator - using new unified lazy system
        },
        filteredCount: {
          fieldName: this.knx.localize("telegram_filter_sort_by_filtered_count"),
          filterable: false,
          sortable:
            destinationFiltersLength > 0 || destinationFilterSortCriterion === "filteredCount",
          sortDisabled: destinationFiltersLength === 0,
          sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
          sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
          sortDefaultDirection: "desc",
          mapper: (item: DistinctValueInfo) => (item.filteredCount || 0).toString(),
        },
      },
    }),
  );

  /**
   * Memoized configuration for direction filter (Incoming/Outgoing)
   */
  private _directionFilterConfig = memoize(
    (hasActiveFilters: boolean, _language: string): ListFilterConfig<DistinctValueInfo> => ({
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      primaryField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      secondaryField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.name,
      },
      badgeField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) =>
          hasActiveFilters ? `${item.filteredCount}/${item.totalCount}` : `${item.totalCount}`,
      },
    }),
  );

  /**
   * Memoized configuration for telegram type filter
   */
  private _telegramTypeFilterConfig = memoize(
    (hasActiveFilters: boolean, _language: string): ListFilterConfig<DistinctValueInfo> => ({
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      primaryField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      secondaryField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.name,
      },
      badgeField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) =>
          hasActiveFilters ? `${item.filteredCount}/${item.totalCount}` : `${item.totalCount}`,
      },
    }),
  );

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handles data table sorting changes
   * Updates the active sort column and direction for relative time calculation
   */
  private _handleSortingChanged({
    detail: { column, direction },
  }: HASSDomEvent<SortingChangedEvent>) {
    this.controller.sortColumn = direction ? (column as TelegramRowKeys) : undefined;
    this.controller.sortDirection = direction || undefined;
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

  /**
   * Handles telegram row selection in the data table
   * Opens the detailed telegram information dialog
   */
  private _handleRowClick(ev: HASSDomEvent<RowClickedEvent>): void {
    this.controller.selectedTelegramId = ev.detail.id;
  }

  /** Closes the telegram detail dialog */
  private _handleDialogClosed(): void {
    this.controller.selectedTelegramId = null;
  }

  /** Toggles the pause state of telegram monitoring */
  private async _handlePauseToggle(): Promise<void> {
    await this.controller.togglePause();
  }

  /** Reloads recent telegrams from the server */
  private async _handleReload(): Promise<void> {
    await this.controller.reload(this.hass);
  }

  /** Attempts to reconnect after a connection error */
  private async _retryConnection(): Promise<void> {
    await this.controller.retryConnection(this.hass);
  }

  /** Clears all active filters */
  private _handleClearFilters(): void {
    this.controller.clearFilters(this.route);
  }

  /**
   * Clears all telegrams from the display and resets filter data
   * Enables the reload button to fetch fresh data
   */
  private _handleClearRows(): void {
    this.controller.clearTelegrams();
  }

  // ============================================================================
  // Filter Event Handlers
  // ============================================================================

  /** Generic handler for filter selection changes */
  private _onFilterSelectionChange = (filterType: string, value: string[]): void => {
    this.controller.setFilterFieldValue(filterType, value, this.route);
  };

  /** Generic handler for filter panel expansion state changes */
  private _onFilterExpansionChange = (id: string, expanded: boolean): void => {
    this.controller.updateExpandedFilter(id, expanded);
  };

  // knx-list-filter component event handlers

  /** Handles source filter selection changes */
  private _handleSourceFilterChange = (ev: HASSDomEvent<ListFilterSelectionChangedEvent>): void => {
    this._onFilterSelectionChange("source", ev.detail.value);
  };

  /** Handles source filter panel expansion */
  private _handleSourceFilterExpanded = (
    ev: HASSDomEvent<ListFilterExpandedChangedEvent>,
  ): void => {
    this._onFilterExpansionChange("source", ev.detail.expanded);
  };

  /** Handles destination filter selection changes */
  private _handleDestinationFilterChange = (
    ev: HASSDomEvent<ListFilterSelectionChangedEvent>,
  ): void => {
    this._onFilterSelectionChange("destination", ev.detail.value);
  };

  /** Handles destination filter panel expansion */
  private _handleDestinationFilterExpanded = (
    ev: HASSDomEvent<ListFilterExpandedChangedEvent>,
  ): void => {
    this._onFilterExpansionChange("destination", ev.detail.expanded);
  };

  /** Handles direction filter selection changes */
  private _handleDirectionFilterChange = (
    ev: HASSDomEvent<ListFilterSelectionChangedEvent>,
  ): void => {
    this._onFilterSelectionChange("direction", ev.detail.value);
  };

  /** Handles direction filter panel expansion */
  private _handleDirectionFilterExpanded = (
    ev: HASSDomEvent<ListFilterExpandedChangedEvent>,
  ): void => {
    this._onFilterExpansionChange("direction", ev.detail.expanded);
  };

  /** Handles telegram type filter selection changes */
  private _handleTelegramTypeFilterChange = (
    ev: HASSDomEvent<ListFilterSelectionChangedEvent>,
  ): void => {
    this._onFilterSelectionChange("telegramtype", ev.detail.value);
  };

  /** Handles telegram type filter panel expansion */
  private _handleTelegramTypeFilterExpanded = (
    ev: HASSDomEvent<ListFilterExpandedChangedEvent>,
  ): void => {
    this._onFilterExpansionChange("telegramtype", ev.detail.expanded);
  };

  // Table cell filter toggle handlers (for quick filtering from table cells)

  /** Toggles source address filter from table cell click */
  private _handleSourceFilterToggle = (ev: HASSDomEvent<ToggleFilterEvent>): void => {
    this.controller.toggleFilterValue("source", ev.detail.value, this.route);
  };

  /** Toggles destination address filter from table cell click */
  private _handleDestinationFilterToggle = (ev: HASSDomEvent<ToggleFilterEvent>): void => {
    this.controller.toggleFilterValue("destination", ev.detail.value, this.route);
  };

  /** Toggles telegram type filter from table cell click */
  private _handleTelegramTypeFilterToggle = (ev: HASSDomEvent<ToggleFilterEvent>): void => {
    this.controller.toggleFilterValue("telegramtype", ev.detail.value, this.route);
  };

  /**
   * Handles sort changes emitted by knx-list-filter components.
   * Triggers a re-render so memoized configs re-evaluate with the latest sort criterion.
   */
  private _handleFilterSortChanged = (
    _ev: CustomEvent<{ criterion: string; direction: string }>,
  ): void => {
    // The child updates its sortCriterion before emitting the event.
    // Force a re-render so memoized filter configs re-compute using the updated criterion.
    this.requestUpdate();
  };

  // ============================================================================
  // Telegram Navigation
  // ============================================================================

  /**
   * Selects the next telegram in the filtered list
   */
  private _selectNextTelegram(): void {
    const { filteredTelegrams } = this._getFilteredData();
    this.controller.navigateTelegram(1, filteredTelegrams);
  }

  /**
   * Selects the previous telegram in the filtered list
   */
  private _selectPreviousTelegram(): void {
    const { filteredTelegrams } = this._getFilteredData();
    this.controller.navigateTelegram(-1, filteredTelegrams);
  }

  // ============================================================================
  // Data Table Column Definitions
  // ============================================================================

  /**
   * Memoized column configuration for the data table
   * Adapts column visibility and behavior based on layout and project status
   * @param narrow - Whether the UI is in narrow/mobile layout
   * @param projectLoaded - Whether a KNX project is loaded (affects column visibility)
   * @param _language - Current language (triggers re-memoization for localization)
   */
  private _columns = memoize(
    (
      narrow: boolean,
      projectLoaded: boolean,
      _language: string,
    ): DataTableColumnContainer<TelegramRow> => ({
      // Timestamp column with relative time offsets when sorting by time
      ["timestampIso" as TelegramRowKeys]: {
        showNarrow: true,
        defaultHidden: narrow,
        filterable: true,
        sortable: true,
        direction: "desc",
        title: this.knx.localize("group_monitor_time"),
        minWidth: "110px",
        maxWidth: "122px",
        template: (row) => html`
          <knx-table-cell>
            <div class="primary" slot="primary">${formatTimeWithMilliseconds(row.timestamp)}</div>
            ${row.offset !== null &&
            (this.controller.sortColumn === ("timestampIso" as TelegramRowKeys) ||
              this.controller.sortColumn === undefined)
              ? html`
                  <div class="secondary" slot="secondary">
                    <span>+</span>
                    <span>${this._formatOffsetWithPrecision(row.offset)}</span>
                  </div>
                `
              : nothing}
          </knx-table-cell>
        `,
      },

      // Main source address column with filterable cell
      sourceAddress: {
        showNarrow: true,
        filterable: true,
        sortable: true,
        title: this.knx.localize("group_monitor_source"),
        flex: 2,
        minWidth: "0",
        template: (row) => html`
          <knx-table-cell-filterable
            .knx=${this.knx}
            .filterValue=${row.sourceAddress}
            .filterDisplayText=${row.sourceAddress}
            .filterActive=${(this.controller.filters.source || []).includes(
              row.sourceAddress as string,
            )}
            .filterDisabled=${this.isMobileTouchDevice}
            @toggle-filter=${this._handleSourceFilterToggle}
          >
            <div class="primary" slot="primary">${row.sourceAddress}</div>
            ${row.sourceText
              ? html`
                  <div class="secondary" slot="secondary" title=${row.sourceText || ""}>
                    ${row.sourceText}
                  </div>
                `
              : nothing}
          </knx-table-cell-filterable>
        `,
      },

      // Hidden column for source text/name filtering
      sourceText: {
        hidden: true,
        filterable: true,
        sortable: true,
        title: this.knx.localize("group_monitor_source_name"),
      },

      // Hidden groupable source name column
      sourceName: {
        showNarrow: true,
        hidden: true,
        sortable: false,
        groupable: true,
        filterable: false,
        title: this.knx.localize("group_monitor_source"),
      },

      // Main destination address column with filterable cell
      destinationAddress: {
        showNarrow: true,
        sortable: true,
        filterable: true,
        title: this.knx.localize("group_monitor_destination"),
        flex: 2,
        minWidth: "0",
        template: (row) => html`
          <knx-table-cell-filterable
            .knx=${this.knx}
            .filterValue=${row.destinationAddress}
            .filterDisplayText=${row.destinationAddress}
            .filterActive=${(this.controller.filters.destination || []).includes(
              row.destinationAddress as string,
            )}
            .filterDisabled=${this.isMobileTouchDevice}
            @toggle-filter=${this._handleDestinationFilterToggle}
          >
            <div class="primary" slot="primary">${row.destinationAddress}</div>
            ${row.destinationText
              ? html`
                  <div class="secondary" slot="secondary" title=${row.destinationText || ""}>
                    ${row.destinationText}
                  </div>
                `
              : nothing}
          </knx-table-cell-filterable>
        `,
      },

      // Hidden column for destination text/name filtering
      destinationText: {
        showNarrow: true,
        hidden: true,
        sortable: true,
        filterable: true,
        title: this.knx.localize("group_monitor_destination_name"),
      },

      // Hidden groupable destination name column
      destinationName: {
        showNarrow: true,
        hidden: true,
        sortable: false,
        groupable: true,
        filterable: false,
        title: this.knx.localize("group_monitor_destination"),
      },

      // Telegram type column with direction indicator and filterable cell
      type: {
        showNarrow: true,
        defaultHidden: narrow,
        title: this.knx.localize("group_monitor_type"),
        filterable: true,
        sortable: true,
        groupable: true,
        minWidth: "155px",
        maxWidth: "155px",
        template: (row) => html`
          <knx-table-cell-filterable
            .knx=${this.knx}
            .filterValue=${row.type}
            .filterDisplayText=${row.type}
            .filterActive=${(this.controller.filters.telegramtype || []).includes(
              row.type as string,
            )}
            .filterDisabled=${this.isMobileTouchDevice}
            @toggle-filter=${this._handleTelegramTypeFilterToggle}
          >
            <div class="primary" slot="primary" title=${row.type}>${row.type}</div>
            <div
              class="secondary"
              slot="secondary"
              style="color: ${row.direction === "Outgoing"
                ? "var(--knx-blue)"
                : "var(--knx-green)"}"
            >
              ${row.direction + (row.dataSecure ? " 🔒" : "")}
            </div>
          </knx-table-cell-filterable>
        `,
      },

      // Hidden direction column for separate filtering
      direction: {
        hidden: true,
        title: this.knx.localize("group_monitor_direction"),
        filterable: true,
        groupable: true,
      },

      // Raw payload data column (hidden on narrow when project loaded)
      payload: {
        showNarrow: false,
        hidden: narrow && projectLoaded,
        title: this.knx.localize("group_monitor_payload"),
        filterable: true,
        sortable: true,
        type: "numeric",
        minWidth: "105px",
        maxWidth: "105px",
        template: (row) => {
          if (!row.payload) return nothing;
          return html`
            <code
              style="
                display: inline-block;
                box-sizing: border-box;
                max-width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-size: 0.9em;
                background: var(--secondary-background-color);
                padding: 2px 4px;
                border-radius: 4px;
              "
              title=${row.payload}
            >
              ${row.payload}
            </code>
          `;
        },
      },

      // Decoded value column (only shown when project is loaded)
      value: {
        showNarrow: true,
        hidden: !projectLoaded,
        title: this.knx.localize("group_monitor_value"),
        filterable: true,
        sortable: true,
        flex: 1,
        minWidth: "0",
        template: (row) => {
          const value = row.value;
          if (!value) return nothing;
          return html`
            <knx-table-cell>
              <span
                class="primary"
                slot="primary"
                style="font-weight: 500; color: var(--primary-color);"
                title=${value}
              >
                ${value}
              </span>
            </knx-table-cell>
          `;
        },
      },
    }),
  );

  // ============================================================================
  // Render Helper Methods
  // ============================================================================

  /**
   * Formats the telegram offset with appropriate precision.
   * If the offset in milliseconds is exactly 0 (00:00.000),
   * shows microsecond precision to display sub-millisecond timing.
   * @param offsetMicros - The offset in microseconds
   * @returns Formatted offset string
   */
  private _formatOffsetWithPrecision(offsetMicros: number | null): string {
    if (offsetMicros === null) {
      return formatTimeDelta(offsetMicros);
    }

    // Convert to milliseconds to check if it's exactly 0
    const offsetMs = Math.round(offsetMicros / 1000);

    // If millisecond part is 0 (e.g., 00:00.000), use microsecond precision
    if (offsetMs === 0 && offsetMicros !== 0) {
      return formatTimeDelta(offsetMicros, "microseconds");
    }

    // Otherwise use default millisecond precision
    return formatTimeDelta(offsetMicros, "milliseconds");
  }

  /**
   * Renders the telegram information dialog for detailed view
   * @param id - The telegram ID to display
   * @returns Template for the dialog component
   */
  private _renderTelegramInfoDialog(id: string): TemplateResult | typeof nothing {
    const { filteredTelegrams } = this._getFilteredData();
    const arrayIndex = filteredTelegrams.findIndex((row) => row.id === id);
    const telegramRow = filteredTelegrams[arrayIndex];

    if (!telegramRow) {
      return nothing;
    }

    return html`
      <knx-group-monitor-telegram-info-dialog
        .hass=${this.hass}
        .knx=${this.knx}
        .narrow=${this.narrow}
        .telegram=${telegramRow}
        .disableNext=${arrayIndex + 1 >= filteredTelegrams.length}
        .disablePrevious=${arrayIndex <= 0}
        @next-telegram=${this._selectNextTelegram}
        @previous-telegram=${this._selectPreviousTelegram}
        @dialog-closed=${this._handleDialogClosed}
      >
      </knx-group-monitor-telegram-info-dialog>
    `;
  }

  // ============================================================================
  // Main Render Method
  // ============================================================================

  /**
   * Main render method that builds the complete UI
   * Combines data table, filters, toolbar actions, and dialogs
   * @returns The complete template for the group monitor interface
   */
  protected render(): TemplateResult {
    const activeFilters = Object.values(this.controller.filters).filter(
      (f) => Array.isArray(f) && f.length,
    ).length;

    // Get filtered data once to avoid update loops
    const { filteredTelegrams, distinctValues } = this._getFilteredData();

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .tabs=${[groupMonitorTab]}
        .route=${this.route!}
        .columns=${this._columns(
          this.narrow,
          this.controller.isProjectLoaded === true,
          this.hass.language,
        )}
        .noDataText=${this.knx.localize("group_monitor_waiting_message")}
        .data=${filteredTelegrams as any}
        .hasFab=${false}
        .searchLabel=${this.searchLabel}
        .localizeFunc=${this.knx.localize as any}
        id="id"
        .clickable=${true}
        .initialSorting=${{
          column: this.controller.sortColumn || ("timestampIso" as TelegramRowKeys),
          direction: this.controller.sortDirection || "desc",
        }}
        @row-click=${this._handleRowClick}
        @sorting-changed=${this._handleSortingChanged}
        has-filters
        .filters=${activeFilters}
        @clear-filter=${this._handleClearFilters}
        @columns-changed=${this._handleColumnsChanged}
        .columnOrder=${this.narrow
          ? this._storedColumns?.narrow?.columnOrder
          : this._storedColumns?.wide?.columnOrder}
        .hiddenColumns=${this.narrow
          ? this._storedColumns?.narrow?.hiddenColumns
          : this._storedColumns?.wide?.hiddenColumns}
      >
        <!-- Top header -->
        ${this.controller.connectionError
          ? html`
              <ha-alert
                slot="top-header"
                .alertType=${"error"}
                .title=${this.knx.localize("group_monitor_connection_error_title")}
              >
                ${this.controller.connectionError}
                <ha-button slot="action" @click=${this._retryConnection}>
                  ${this.knx.localize("group_monitor_retry_connection")}
                </ha-button>
              </ha-alert>
            `
          : nothing}
        ${this.controller.isPaused
          ? html`
              <ha-alert
                slot="top-header"
                .alertType=${"info"}
                .dismissable=${false}
                .title=${this.knx.localize("group_monitor_paused_title")}
              >
                ${this.knx.localize("group_monitor_paused_message")}
                <ha-button slot="action" @click=${this._handlePauseToggle}>
                  ${this.knx.localize("group_monitor_resume")}
                </ha-button>
              </ha-alert>
            `
          : ""}
        ${this.controller.isProjectLoaded === false
          ? html`
              <ha-alert
                slot="top-header"
                .alertType=${"info"}
                .dismissable=${true}
                .title=${this.knx.localize("group_monitor_project_not_loaded_title")}
              >
                ${this.knx.localize("group_monitor_project_not_loaded_message")}
              </ha-alert>
            `
          : nothing}

        <!-- Toolbar actions -->
        <div slot="toolbar-icon" class="toolbar-actions">
          <ha-icon-button
            .label=${this.controller.isPaused
              ? this.knx.localize("group_monitor_resume")
              : this.knx.localize("group_monitor_pause")}
            .path=${this.controller.isPaused ? mdiFastForward : mdiPause}
            class=${this.controller.isPaused ? "active" : ""}
            @click=${this._handlePauseToggle}
            data-testid="pause-button"
            .title=${this.controller.isPaused
              ? this.knx.localize("group_monitor_resume")
              : this.knx.localize("group_monitor_pause")}
          >
          </ha-icon-button>
          <ha-icon-button
            .label=${this.knx.localize("group_monitor_clear")}
            .path=${mdiDeleteSweep}
            @click=${this._handleClearRows}
            ?disabled=${this.controller.telegrams.length === 0}
            data-testid="clean-button"
            .title=${this.knx.localize("group_monitor_clear")}
          >
          </ha-icon-button>
          <ha-icon-button
            .label=${this.knx.localize("group_monitor_reload")}
            .path=${mdiRefresh}
            @click=${this._handleReload}
            ?disabled=${!this.controller.isReloadEnabled}
            data-testid="reload-button"
            .title=${this.knx.localize("group_monitor_reload")}
          >
          </ha-icon-button>
        </div>

        <!-- Filter for Source Address -->
        <knx-list-filter
          data-filter="source"
          slot="filter-pane"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${Object.values(distinctValues.source)}
          .config=${this._sourceFilterConfig(
            this._hasActiveFilters("source"),
            this.controller.filters.source?.length || 0,
            this.sourceFilter?.sortCriterion,
            this.hass.language,
          ) as any}
          .selectedOptions=${this.controller.filters.source}
          .expanded=${this.controller.expandedFilter === "source"}
          .narrow=${this.narrow}
          .isMobileDevice=${this.isMobileTouchDevice}
          .filterTitle=${this.knx.localize("group_monitor_source")}
          @selection-changed=${this._handleSourceFilterChange}
          @expanded-changed=${this._handleSourceFilterExpanded}
          @sort-changed=${this._handleFilterSortChanged}
        ></knx-list-filter>

        <!-- Filter for Destination Address -->
        <knx-list-filter
          data-filter="destination"
          slot="filter-pane"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${Object.values(distinctValues.destination)}
          .config=${this._destinationFilterConfig(
            this._hasActiveFilters("destination"),
            this.controller.filters.destination?.length || 0,
            this.destinationFilter?.sortCriterion,
            this.hass.language,
          ) as any}
          .selectedOptions=${this.controller.filters.destination}
          .expanded=${this.controller.expandedFilter === "destination"}
          .narrow=${this.narrow}
          .isMobileDevice=${this.isMobileTouchDevice}
          .filterTitle=${this.knx.localize("group_monitor_destination")}
          @selection-changed=${this._handleDestinationFilterChange}
          @expanded-changed=${this._handleDestinationFilterExpanded}
          @sort-changed=${this._handleFilterSortChanged}
        ></knx-list-filter>

        <!-- Filter for Direction -->
        <knx-list-filter
          slot="filter-pane"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${Object.values(distinctValues.direction)}
          .config=${this._directionFilterConfig(
            this._hasActiveFilters("direction"),
            this.hass.language,
          ) as any}
          .selectedOptions=${this.controller.filters.direction}
          .pinSelectedItems=${false}
          .expanded=${this.controller.expandedFilter === "direction"}
          .narrow=${this.narrow}
          .isMobileDevice=${this.isMobileTouchDevice}
          .filterTitle=${this.knx.localize("group_monitor_direction")}
          @selection-changed=${this._handleDirectionFilterChange}
          @expanded-changed=${this._handleDirectionFilterExpanded}
        ></knx-list-filter>

        <!-- Filter for Telegram Type -->
        <knx-list-filter
          slot="filter-pane"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${Object.values(distinctValues.telegramtype)}
          .config=${this._telegramTypeFilterConfig(
            this._hasActiveFilters("telegramtype"),
            this.hass.language,
          ) as any}
          .selectedOptions=${this.controller.filters.telegramtype}
          .pinSelectedItems=${false}
          .expanded=${this.controller.expandedFilter === "telegramtype"}
          .narrow=${this.narrow}
          .isMobileDevice=${this.isMobileTouchDevice}
          .filterTitle=${this.knx.localize("group_monitor_type")}
          @selection-changed=${this._handleTelegramTypeFilterChange}
          @expanded-changed=${this._handleTelegramTypeFilterExpanded}
        ></knx-list-filter>
      </hass-tabs-subpage-data-table>

      <!-- Telegram detail dialog -->
      ${this.controller.selectedTelegramId !== null
        ? this._renderTelegramInfoDialog(this.controller.selectedTelegramId)
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-group-monitor": KNXGroupMonitor;
  }
}
