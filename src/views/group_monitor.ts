import { css, html, CSSResultGroup, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";

import { computeRTLDirection } from "@ha/common/util/compute_rtl";
import type {
  DataTableColumnContainer,
  DataTableRowData,
} from "@ha/components/data-table/ha-data-table";
import { haStyle } from "@ha/resources/styles";
import { HomeAssistant } from "@ha/types";

import { subscribeKnxTelegrams, getGroupMonitorInfo } from "../services/websocket.service";
import { KNX } from "../types/knx";
import { KNXTelegram } from "../types/websocket";
import "../table/knx-data-table";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("group_monitor");

@customElement("knx-group-monitor")
export class KNXGroupMonitor extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property() private columns: DataTableColumnContainer = {};

  @state() private projectLoaded = false;

  @state() private subscribed?: () => void;

  @state() private rows: DataTableRowData[] = [];

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
          this.rows = groupMonitorInfo.recent_telegrams
            .reverse()
            .map((telegram, index) => this._telegramToRow(telegram, index));
        },
        (err) => {
          logger.error("getGroupMonitorInfo", err);
        }
      );
      this.subscribed = await subscribeKnxTelegrams(this.hass, (message) => {
        this.telegram_callback(message);
        this.requestUpdate();
      });

      //! We need to lateinit this property due to the fact that this.hass needs to be available
      this.columns = {
        rowIndex: {
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
          title: html`${this.knx.localize("group_monitor_time")}`,
          width: "110px",
        },
        direction: {
          hidden: this.narrow,
          filterable: true,
          title: html`${this.knx.localize("group_monitor_direction")}`,
          width: "90px",
        },
        sourceAddress: {
          filterable: true,
          sortable: true,
          title: html`${this.knx.localize("group_monitor_source")}`,
          width: this.narrow ? "90px" : this.projectLoaded ? "95px" : "20%",
        },
        sourceText: {
          hidden: this.narrow || !this.projectLoaded,
          filterable: true,
          sortable: true,
          title: html`${this.knx.localize("group_monitor_source")}`,
          width: "20%",
        },
        destinationAddress: {
          sortable: true,
          filterable: true,
          title: html`${this.knx.localize("group_monitor_destination")}`,
          width: this.narrow ? "90px" : this.projectLoaded ? "96px" : "20%",
        },
        destinationText: {
          hidden: this.narrow || !this.projectLoaded,
          sortable: true,
          filterable: true,
          title: html`${this.knx.localize("group_monitor_destination")}`,
          width: "20%",
        },
        type: {
          hidden: this.narrow,
          title: html`${this.knx.localize("group_monitor_type")}`,
          filterable: true,
          width: "155px", // 155px suits for "GroupValueResponse"
        },
        payload: {
          hidden: this.narrow && this.projectLoaded,
          title: html`${this.knx.localize("group_monitor_payload")}`,
          filterable: true,
          type: "numeric",
          width: "105px",
        },
        value: {
          hidden: !this.projectLoaded,
          title: html`${this.knx.localize("group_monitor_value")}`,
          filterable: true,
          width: this.narrow ? "105px" : "150px",
        },
      };
    }
  }

  protected telegram_callback(telegram: KNXTelegram): void {
    const rows = [...this.rows];
    rows.push(this._telegramToRow(telegram, rows.length));
    this.rows = rows;
  }

  protected _telegramToRow(telegram: KNXTelegram, index: number): DataTableRowData {
    return {
      rowIndex: index,
      destinationAddress: telegram.destination_address,
      destinationText: telegram.destination_text,
      direction: this.knx.localize(telegram.direction),
      payload: telegram.payload,
      sourceAddress: telegram.source_address,
      sourceText: telegram.source_text,
      timestamp: telegram.timestamp,
      type: telegram.type,
      value: !this.narrow ? telegram.value : this.narrow_value(telegram),
    };
  }

  protected narrow_value(telegram: KNXTelegram): string {
    return (
      telegram.value || telegram.payload || (telegram.type === "GroupValueRead" ? "GroupRead" : "")
    );
  }

  protected render(): TemplateResult | void {
    return html`
      <knx-data-table
        .hass=${this.hass}
        .columns=${this.columns}
        .noDataText=${this.subscribed
          ? this.knx.localize("group_monitor_connected_waiting_telegrams")
          : this.knx.localize("group_monitor_waiting_to_connect")}
        .data=${this.rows}
        .hasFab=${false}
        .searchLabel=${this.hass.localize("ui.components.data-table.search")}
        .dir=${computeRTLDirection(this.hass)}
        id="rowIndex"
      >
      </knx-data-table>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .telegram {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-group-monitor": KNXGroupMonitor;
  }
}
