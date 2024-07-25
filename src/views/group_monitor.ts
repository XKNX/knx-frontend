import { html, CSSResultGroup, LitElement, TemplateResult, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/layouts/hass-tabs-subpage-data-table";
import { HASSDomEvent } from "@ha/common/dom/fire_event";
import { computeRTLDirection } from "@ha/common/util/compute_rtl";
import type {
  DataTableColumnContainer,
  DataTableRowData,
  RowClickedEvent,
} from "@ha/components/data-table/ha-data-table";
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

  @state() private columns: DataTableColumnContainer = {};

  @state() private projectLoaded = false;

  @state() private subscribed?: () => void;

  @state() private telegrams: TelegramDict[] = [];

  @state() private rows: DataTableRowData[] = [];

  @state() private _dialogIndex: number | null = null;

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this.subscribed) {
      this.subscribed();
      this.subscribed = undefined;
    }
  }

  protected async firstUpdated() {
    if (!this.subscribed) {
      getGroupMonitorInfo(this.hass).then(
        (groupMonitorInfo) => {
          this.projectLoaded = groupMonitorInfo.project_loaded;
          this.telegrams = groupMonitorInfo.recent_telegrams;
          this.rows = this.telegrams.map((telegram, index) => this._telegramToRow(telegram, index));
        },
        (err) => {
          logger.error("getGroupMonitorInfo", err);
        },
      );
      this.subscribed = await subscribeKnxTelegrams(this.hass, (message) => {
        this.telegram_callback(message);
        this.requestUpdate();
      });

      //! We need to lateinit this property due to the fact that this.hass needs to be available
      this.columns = {
        index: {
          hidden: this.narrow,
          title: "#",
          sortable: true,
          direction: "desc",
          type: "numeric",
          width: "60px", // 4 digits
        },
        timestamp: {
          filterable: true,
          sortable: true,
          title: this.knx.localize("group_monitor_time"),
          width: "110px",
        },
        direction: {
          hidden: this.narrow,
          filterable: true,
          title: this.knx.localize("group_monitor_direction"),
          width: "120px",
        },
        sourceAddress: {
          filterable: true,
          sortable: true,
          title: this.knx.localize("group_monitor_source"),
          width: this.narrow ? "90px" : this.projectLoaded ? "95px" : "20%",
        },
        sourceText: {
          hidden: this.narrow || !this.projectLoaded,
          filterable: true,
          sortable: true,
          title: this.knx.localize("group_monitor_source"),
          width: "20%",
        },
        destinationAddress: {
          sortable: true,
          filterable: true,
          title: this.knx.localize("group_monitor_destination"),
          width: this.narrow ? "90px" : this.projectLoaded ? "96px" : "20%",
        },
        destinationText: {
          hidden: this.narrow || !this.projectLoaded,
          sortable: true,
          filterable: true,
          title: this.knx.localize("group_monitor_destination"),
          width: "20%",
        },
        type: {
          hidden: this.narrow,
          title: this.knx.localize("group_monitor_type"),
          filterable: true,
          width: "155px", // 155px suits for "GroupValueResponse"
        },
        payload: {
          hidden: this.narrow && this.projectLoaded,
          title: this.knx.localize("group_monitor_payload"),
          filterable: true,
          type: "numeric",
          width: "105px",
        },
        value: {
          hidden: !this.projectLoaded,
          title: this.knx.localize("group_monitor_value"),
          filterable: true,
          width: this.narrow ? "105px" : "150px",
        },
      };
    }
  }

  protected telegram_callback(telegram: TelegramDict): void {
    this.telegrams.push(telegram);
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
    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .route=${this.route!}
        .tabs=${this.tabs}
        .localizeFunc=${this.knx.localize}
        .columns=${this.columns}
        .noDataText=${this.subscribed
          ? this.knx.localize("group_monitor_connected_waiting_telegrams")
          : this.knx.localize("group_monitor_waiting_to_connect")}
        .data=${this.rows}
        .hasFab=${false}
        .searchLabel=${this.hass.localize("ui.components.data-table.search")}
        .dir=${computeRTLDirection(this.hass)}
        id="index"
        .clickable=${true}
        @row-click=${this._rowClicked}
      ></hass-tabs-subpage-data-table>
      ${this._dialogIndex !== null ? this._renderTelegramInfoDialog(this._dialogIndex) : nothing}
    `;
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
