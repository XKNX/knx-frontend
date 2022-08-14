import { css, html, LitElement, TemplateResult } from "lit";
import { state } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import "../../homeassistant-frontend/src/components/ha-button-menu";
import "../../homeassistant-frontend/src/components/ha-card";
import "../../homeassistant-frontend/src/layouts/ha-app-layout";
import "../../homeassistant-frontend/src/layouts/hass-subpage";
import { HomeAssistant } from "../../homeassistant-frontend/src/types";
import { getKnxInfo } from "../services/websocket.service";
import { KNXInfo } from "../types/websocket";

@customElement("knx-overview")
export class KNXOverview extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;
  @property({ type: Boolean, reflect: true }) public narrow!: boolean;
  @state() private knxInfo: KNXInfo | null = null;

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
        <div class="card-content knx-info-section">
          <div class="knx-content-row">
            <div>XKNX Version</div>
            <div>${this.knxInfo?.version}</div>
          </div>

          <div class="knx-content-row">
            <div>Connected to Bus</div>
            <div>${this.knxInfo?.connected ? "Yes" : "No"}</div>
          </div>

          <div class="knx-content-row">
            <div>Individual address</div>
            <div>${this.knxInfo?.current_address}</div>
          </div>
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      .knx-info {
        max-width: 400px;
      }

      .knx-info-section {
        display: flex;
        flex-direction: column;
      }

      .knx-content-row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-overview": KNXOverview;
  }
}
