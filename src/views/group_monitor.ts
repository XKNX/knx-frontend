import { html, CSSResultGroup, LitElement, TemplateResult, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import { mdiPause, mdiAutorenew } from "@mdi/js";
import memoize from "memoize-one";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage-data-table";
import { HASSDomEvent } from "@ha/common/dom/fire_event";
import { computeRTLDirection } from "@ha/common/util/compute_rtl";
import { navigate } from "@ha/common/navigate";
import type {
  DataTableColumnContainer,
  DataTableRowData,
  RowClickedEvent,
} from "@ha/components/data-table/ha-data-table";
import "@ha/components/ha-icon-button";
import { haStyle } from "@ha/resources/styles";
import { HomeAssistant, Route } from "@ha/types";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import { subscribeKnxTelegrams, getGroupMonitorInfo } from "../services/websocket.service";
import { KNX } from "../types/knx";
import { TelegramDict } from "../types/websocket";
import { TelegramDictFormatter } from "../utils/format";
import "../dialogs/knx-telegram-info-dialog";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("group_monitor");

@customElement("knx-group-monitor")
export class KNXGroupMonitor extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  @state() private projectLoaded = false;

  @state() private subscribed?: () => void;

  @state() private telegrams: TelegramDict[] = [];

  @state() private rows: DataTableRowData[] = [];

  @state() private _dialogIndex: number | null = null;

  @state() private _pause: boolean = false;

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this.subscribed) {
      this.subscribed();
      this.subscribed = undefined;
    }
  }

  protected async firstUpdated() {
    if (!this.subscribed) {
      getGroupMonitorInfo(this.hass)
        .then((groupMonitorInfo) => {
          this.projectLoaded = groupMonitorInfo.project_loaded;
          this.telegrams = groupMonitorInfo.recent_telegrams;
          this.rows = this.telegrams.map((telegram, index) => this._telegramToRow(telegram, index));
        })
        .catch((err) => {
          logger.error("getGroupMonitorInfo", err);
          navigate("/knx/error", { replace: true, data: err });
        });
      this.subscribed = await subscribeKnxTelegrams(this.hass, (message) => {
        this.telegram_callback(message);
        this.requestUpdate();
      });
    }
  }

  private _columns = memoize(
    (narrow, projectLoaded, _language): DataTableColumnContainer<DataTableRowData> => ({
      index: {
        showNarrow: false,
        title: "#",
        sortable: true,
        direction: "desc",
        type: "numeric",
        minWidth: "60px", // 4 digits
        maxWidth: "60px",
      },
      timestamp: {
        showNarrow: false,
        filterable: true,
        sortable: true,
        title: this.knx.localize("group_monitor_time"),
        minWidth: "110px",
        maxWidth: "110px",
      },
      sourceAddress: {
        showNarrow: true,
        filterable: true,
        sortable: true,
        title: this.knx.localize("group_monitor_source"),
        flex: 2,
        minWidth: "0", // prevent horizontal scroll on very narrow screens
        template: (row) =>
          projectLoaded
            ? html`<div>${row.sourceAddress}</div>
                <div>${row.sourceText}</div>`
            : row.sourceAddress,
      },
      sourceText: {
        hidden: true,
        filterable: true,
        sortable: true,
        title: this.knx.localize("group_monitor_source"),
      },
      destinationAddress: {
        showNarrow: true,
        sortable: true,
        filterable: true,
        title: this.knx.localize("group_monitor_destination"),
        flex: 2,
        minWidth: "0", // prevent horizontal scroll on very narrow screens
        template: (row) =>
          projectLoaded
            ? html`<div>${row.destinationAddress}</div>
                <div>${row.destinationText}</div>`
            : row.destinationAddress,
      },
      destinationText: {
        showNarrow: true,
        hidden: true,
        sortable: true,
        filterable: true,
        title: this.knx.localize("group_monitor_destination"),
      },
      type: {
        showNarrow: false,
        title: this.knx.localize("group_monitor_type"),
        filterable: true,
        minWidth: "155px", // 155px suits for "GroupValueResponse"
        maxWidth: "155px",
        template: (row) =>
          html`<div>${row.type}</div>
            <div>${row.direction}</div>`,
      },
      payload: {
        showNarrow: false,
        hidden: narrow && projectLoaded,
        title: this.knx.localize("group_monitor_payload"),
        filterable: true,
        type: "numeric",
        minWidth: "105px",
        maxWidth: "105px",
      },
      value: {
        showNarrow: true,
        hidden: !projectLoaded,
        title: this.knx.localize("group_monitor_value"),
        filterable: true,
        flex: 1,
        minWidth: "0", // prevent horizontal scroll on very narrow screens
      },
    }),
  );

  protected telegram_callback(telegram: TelegramDict): void {
    this.telegrams.push(telegram);
    if (this._pause) return;
    const rows = [...this.rows];
    rows.push(this._telegramToRow(telegram, rows.length));
    this.rows = rows;
  }

  protected _telegramToRow(telegram: TelegramDict, index: number): DataTableRowData {
    const value = TelegramDictFormatter.valueWithUnit(telegram);
    const payload = TelegramDictFormatter.payload(telegram);
    return {
      index: index,
      destinationAddress: telegram.destination,
      destinationText: telegram.destination_name,
      direction: this.knx.localize(telegram.direction),
      payload: payload,
      sourceAddress: telegram.source,
      sourceText: telegram.source_name,
      timestamp: TelegramDictFormatter.timeWithMilliseconds(telegram),
      type: telegram.telegramtype,
      value: !this.narrow
        ? value
        : value || payload || (telegram.telegramtype === "GroupValueRead" ? "GroupRead" : ""),
    };
  }

  protected render(): TemplateResult | void {
    if (this.subscribed === undefined) {
      return html` <hass-loading-screen
        .message=${this.knx.localize("group_monitor_waiting_to_connect")}
      >
      </hass-loading-screen>`;
    }
    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .route=${this.route!}
        .tabs=${this.tabs}
        .localizeFunc=${this.knx.localize}
        .columns=${this._columns(this.narrow, this.projectLoaded, this.hass.language)}
        .noDataText=${this.knx.localize("group_monitor_connected_waiting_telegrams")}
        .data=${this.rows}
        .hasFab=${false}
        .searchLabel=${this.hass.localize("ui.components.data-table.search")}
        .dir=${computeRTLDirection(this.hass)}
        id="index"
        .clickable=${true}
        @row-click=${this._rowClicked}
      >
        <ha-icon-button
          slot="toolbar-icon"
          .label=${this._pause ? "Resume" : "Pause"}
          .path=${this._pause ? mdiAutorenew : mdiPause}
          @click=${this._togglePause}
        ></ha-icon-button>
      </hass-tabs-subpage-data-table>
      ${this._dialogIndex !== null ? this._renderTelegramInfoDialog(this._dialogIndex) : nothing}
    `;
  }

  private _togglePause(): void {
    this._pause = !this._pause;
    if (!this._pause) {
      const currentRowCount = this.rows.length;
      const pauseTelegrams = this.telegrams.slice(currentRowCount);
      this.rows = this.rows.concat(
        pauseTelegrams.map((telegram, index) =>
          this._telegramToRow(telegram, currentRowCount + index),
        ),
      );
    }
  }

  private _renderTelegramInfoDialog(index: number): TemplateResult {
    return html` <knx-telegram-info-dialog
      .hass=${this.hass}
      .knx=${this.knx}
      .telegram=${this.telegrams[index]}
      .index=${index}
      .disableNext=${index! + 1 >= this.telegrams.length}
      .disablePrevious=${index <= 0}
      @next-telegram=${this._dialogNext}
      @previous-telegram=${this._dialogPrevious}
      @dialog-closed=${this._dialogClosed}
    ></knx-telegram-info-dialog>`;
  }

  private async _rowClicked(ev: HASSDomEvent<RowClickedEvent>): Promise<void> {
    const telegramIndex: number = Number(ev.detail.id);
    this._dialogIndex = telegramIndex;
  }

  private _dialogNext(): void {
    this._dialogIndex = this._dialogIndex! + 1;
  }

  private _dialogPrevious(): void {
    this._dialogIndex = this._dialogIndex! - 1;
  }

  private _dialogClosed(): void {
    this._dialogIndex = null;
  }

  static get styles(): CSSResultGroup {
    return haStyle;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-group-monitor": KNXGroupMonitor;
  }
}
