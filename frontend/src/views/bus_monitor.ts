import { subscribeKnxTelegrams } from "@services/websocket.service";
import { KNXTelegram } from "@typing/websocket";
import { HomeAssistant } from "custom-card-helpers";
import { css, html, LitElement, TemplateResult } from "lit";
import { state } from "lit-element";
import { customElement, property } from "lit/decorators.js";

@customElement("knx-bus-monitor")
export class KNXBusMonitor extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;
  @property({ type: Boolean, reflect: true }) public narrow!: boolean;
  @state() private telegrams: KNXTelegram[] = [];
  @state() private subscribed?: () => void;

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
      this.telegrams = [];
    }
  }

  protected telegram_callback(telegram: KNXTelegram): void {
    this.telegrams.push(telegram);
    this.requestUpdate();
  }

  protected render(): TemplateResult | void {
    return html`
      <ha-card class="knx-info" header="KNX Bus Monitor">
        ${this.telegrams.map(
          (telegram) => html`
            <div class="telegram">
              <div>${telegram.destination_address}</div>
              <div>${telegram.source_address}</div>
              <div>${telegram.payload}</div>
              <div>${telegram.direction}</div>
              <div>${telegram.timestamp}</div>
            </div>
          `
        )}
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      .telegram {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
      }
    `;
  }
}
