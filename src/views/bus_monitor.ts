// import "@material/mwc-button";
// import "@material/mwc-fab";
// import "@material/mwc-list/mwc-list-item";
// import "@polymer/app-layout/app-header/app-header";
// import "@polymer/app-layout/app-toolbar/app-toolbar";
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

@customElement("knx-bus-monitor")
export class KNXBusMonitor extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property() private columns: DataTableColumnContainer = {
    timestamp: {
      filterable: true,
      sortable: true,
      title: html`Time`,
      width: "15%",
    },
    direction: {
      filterable: true,
      sortable: true,
      title: html`Direction`,
      width: "15%",
    },
    sourceAddress: {
      filterable: true,
      sortable: true,
      title: html`Source Address`,
      width: "15%",
    },
    destinationAddress: {
      sortable: true,
      filterable: true,
      title: html`Destination Address`,
      width: "15%",
    },
    type: {
      title: html`Type`,
      filterable: true,
      grows: true,
    },
    payload: {
      title: html`Payload`,
      filterable: true,
      grows: true,
    },
  };

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
    }
  }

  protected telegram_callback(telegram: KNXTelegram): void {
    const rows = [...this.rows];
    rows.push({
      destinationAddress: telegram.destination_address,
      direction: telegram.direction,
      payload: telegram.payload,
      sourceAddress: telegram.source_address,
      timestamp: telegram.timestamp,
      type: telegram.type,
    });
    this.rows = rows;
  }

  protected render(): TemplateResult | void {
    return html`
      <ha-data-table
        .hass=${this.hass}
        .columns=${this.columns}
        .data=${this.rows}
        .hasFab=${false}
        .id=${this.id}
        .dir=${computeRTLDirection(this.hass)}
      >
      </ha-data-table>
      <div class="telegram_counter">
        <div class="telegram_counter_label">Telegram count:</div>
        <div>${this.rows.length}</div>
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      css`
        ha-data-table {
          height: calc(100vh - 160px);
        }

        .telegram {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
        }

        .telegram_counter {
          margin-top: 0.4rem;
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          max-width: 200px;
        }

        .telegram_counter_label {
          font-size: 12px;
          font-weight: bold;
        }
      `,
      haStyle,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-bus-monitor": KNXBusMonitor;
  }
}
