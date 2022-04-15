import {
    LitElement,
    html,
    css,
    TemplateResult,
} from "lit";
import {
    customElement,
    property,
} from "lit/decorators.js";
import {HomeAssistant} from "custom-card-helpers";

@customElement("knx-custom-panel")
export class KNXCustomPanel extends LitElement {
    @property({type: Object}) public hass!: HomeAssistant;
    @property({type: Boolean, reflect: true}) public narrow!: boolean;

    async firstUpdated() {
        this.requestUpdate();
    }

    protected render(): TemplateResult | void {
        return html`
            <div class="main">
                <h1 class="heading">KNX UI</h1>
            </div>
        `;
    }

    static get styles() {
        return css`
      :host {
        display: block;
        height: 100%;
        margin-left: 2rem;
        margin-right: 2rem;
        background-color: var(--primary-background-color);
      }

      .heading {
        text-align: center;
      }
      
      .main {
        margin: 0 auto;
      }
    `;
    }
}
