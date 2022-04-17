import { subscribeKnxTelegrams } from "@services/websocket.service";
import { DataTableColumnContainer, DataTableRowData } from "@typing/table";
import { KNXTelegram } from "@typing/websocket";
import { computeRTLDirection, HomeAssistant } from "custom-card-helpers";
import { css, html, LitElement, TemplateResult } from "lit";
import { state } from "lit-element";
import { customElement, property } from "lit/decorators.js";

@customElement("knx-bus-monitor")
export class KNXBusMonitor extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;
  @property({ type: Boolean, reflect: true }) public narrow!: boolean;
  @state() private subscribed?: () => void;

  @state() private rows: DataTableRowData[] = [];
  @property() private columns: DataTableColumnContainer = {
    timestamp: {
      filterable: true,
      title: html`Time`,
      width: "15%",
    },
    direction: {
      filterable: true,
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

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this.subscribed) {
      this.subscribed();
      this.subscribed = undefined;
    }
  }

  protected async firstUpdated() {
    if (!this.subscribed) {
      this.subscribed = await subscribeKnxTelegrams(this.hass, (message) =>
        this.telegram_callback(message)
      );
      this.rows = [];
    }
  }

  protected telegram_callback(telegram: KNXTelegram): void {
    this.rows.push({
      destinationAddress: telegram.destination_address,
      direction: telegram.direction,
      payload: telegram.payload,
      sourceAddress: telegram.source_address,
      timestamp: telegram.timestamp,
      type: "TBD",
    });
    this.requestUpdate();
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
    `;
  }

  static get styles() {
    return css`
      ha-data-table {
        height: calc(100vh - 150px);
      }

      .telegram {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
      }
    `;
  }
}
