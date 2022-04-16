import { getKnxInfo } from "@services/websocket.service";
import { KnxInfo } from "@typing/websocket";
import { HomeAssistant } from "custom-card-helpers";
import { css, html, LitElement, TemplateResult } from "lit";
import { state } from "lit-element";
import { customElement, property } from "lit/decorators.js";

@customElement("knx-overview")
export class KNXOverview extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;
  @property({ type: Boolean, reflect: true }) public narrow!: boolean;
  @state() private knxInfo: KnxInfo | null = null;

  protected firstUpdated() {
    getKnxInfo(this.hass).then((knxInfo) => {
      this.knxInfo = knxInfo;
      this.requestUpdate();
    });
  }

  protected render(): TemplateResult | void {
    if (!this.knxInfo) {
      return html`Loading...`;
    }

    return html`
      <ha-card class="knx-info" header="KNX Information">
        <div class="card-content">
          <div class="knx-version">XKNX Version: ${this.knxInfo?.version}</div>
          <div class="knx-connection-state">
            Connected to Bus: ${this.knxInfo?.connected ? "Yes" : "No"}
          </div>
          <div>Individual address: ${this.knxInfo?.current_address}</div>
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      .knx-info {
        max-width: 400px;
      }
    `;
  }
}
