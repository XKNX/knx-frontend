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

import { subscribeKnxTelegrams } from "../services/websocket.service";
import { KNXTelegram } from "../types/websocket";
import { localize } from "../localize/localize";
import "../table/knx-data-table";

@customElement("knx-group-monitor")
export class KNXGroupMonitor extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property() private columns: DataTableColumnContainer = {};

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
          width: this.narrow ? "30%" : "5%",
        },
        direction: {
          hidden: this.narrow,
          filterable: true,
          sortable: true,
          title: html`${localize(this.hass!.language, "group_monitor_direction")}`,
          width: "15%",
        },
        sourceAddress: {
          filterable: true,
          sortable: true,
          title: html`${localize(this.hass!.language, "group_monitor_source")}`,
          width: this.narrow ? "20%" : "15%",
        },
        destinationAddress: {
          sortable: true,
          filterable: true,
          title: html`${localize(this.hass!.language, "group_monitor_destination")}`,
          width: this.narrow ? "20%" : "15%",
        },
        type: {
          hidden: this.narrow,
          title: html`${localize(this.hass!.language, "group_monitor_type")}`,
          filterable: true,
          grows: true,
        },
        payload: {
          title: html`${localize(this.hass!.language, "group_monitor_payload")}`,
          filterable: true,
          grows: true,
        },
      };
    }
  }

  protected telegram_callback(telegram: KNXTelegram): void {
    const rows = [...this.rows];
    rows.push({
      destinationAddress: telegram.destination_address,
      direction: localize(this.hass!.language || "en", telegram.direction),
      payload: telegram.payload,
      sourceAddress: telegram.source_address,
      timestamp: telegram.timestamp,
      type: telegram.type,
    });
    this.rows = rows;
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
