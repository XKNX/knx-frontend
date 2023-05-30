import { css, html, CSSResultGroup, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";

import { computeRTLDirection } from "@ha/common/util/compute_rtl";
import "@ha/components/data-table/ha-data-table";
import type {
  DataTableColumnContainer,
  DataTableRowData,
} from "@ha/components/data-table/ha-data-table";
import "@ha/components/ha-button-menu";
import "@ha/components/ha-card";
import "@ha/layouts/ha-app-layout";
import "@ha/layouts/hass-subpage";
import { haStyle } from "@ha/resources/styles";
import { HomeAssistant } from "@ha/types";

import { subscribeKnxTelegrams, getGroupMonitorInfo } from "../services/websocket.service";
import { KNXTelegram } from "../types/websocket";
import { localize } from "../localize/localize";
import "../table/knx-data-table";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("group_monitor");

@customElement("knx-group-monitor")
export class KNXGroupMonitor extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

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
          this.rows = groupMonitorInfo.recent_telegrams.map((telegram) =>
            this._telegramToRow(telegram)
          );
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
        timestamp: {
          filterable: true,
          sortable: true,
          title: html`${localize(this.hass!.language, "group_monitor_time")}`,
          width: "110px",
        },
        direction: {
          hidden: this.narrow,
          filterable: true,
          title: html`${localize(this.hass!.language, "group_monitor_direction")}`,
          width: "90px",
        },
        sourceAddress: {
          filterable: true,
          sortable: true,
          title: html`${localize(this.hass!.language, "group_monitor_source")}`,
          width: this.narrow ? "90px" : this.projectLoaded ? "95px" : "20%",
        },
        sourceText: {
          hidden: this.narrow || !this.projectLoaded,
          filterable: true,
          sortable: true,
          title: html`${localize(this.hass!.language, "group_monitor_source")}`,
          width: "20%",
        },
        destinationAddress: {
          sortable: true,
          filterable: true,
          title: html`${localize(this.hass!.language, "group_monitor_destination")}`,
          width: this.narrow ? "90px" : this.projectLoaded ? "96px" : "20%",
        },
        destinationText: {
          hidden: this.narrow || !this.projectLoaded,
          sortable: true,
          filterable: true,
          title: html`${localize(this.hass!.language, "group_monitor_destination")}`,
          width: "20%",
        },
        type: {
          hidden: this.narrow,
          title: html`${localize(this.hass!.language, "group_monitor_type")}`,
          filterable: true,
          width: "155px", // 155px suits for "GroupValueResponse"
        },
        payload: {
          hidden: this.narrow && this.projectLoaded,
          title: html`${localize(this.hass!.language, "group_monitor_payload")}`,
          filterable: true,
          width: "105px",
        },
        value: {
          hidden: !this.projectLoaded,
          title: html`${localize(this.hass!.language, "group_monitor_value")}`,
          filterable: true,
          width: this.narrow ? "105px" : "150px",
        },
      };
    }
  }

  protected telegram_callback(telegram: KNXTelegram): void {
    const rows = [...this.rows];
    rows.unshift(this._telegramToRow(telegram));
    this.rows = rows;
  }

  protected _telegramToRow(telegram: KNXTelegram): DataTableRowData {
    return {
      destinationAddress: telegram.destination_address,
      destinationText: telegram.destination_text,
      direction: localize(this.hass!.language || "en", telegram.direction),
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
          ? localize(this.hass.language, "group_monitor_connected_waiting_telegrams")
          : localize(this.hass.language, "group_monitor_waiting_to_connect")}
        .data=${this.rows}
        .hasFab=${false}
        .id=${this.id}
        .searchLabel=${this.hass.localize("ui.components.data-table.search")}
        .dir=${computeRTLDirection(this.hass)}
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
