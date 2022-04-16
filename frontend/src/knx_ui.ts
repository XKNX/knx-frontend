import { NavigationService } from "@services/navigation.service";
import { HomeAssistantComponentLoader } from "@util/load-ha";
import { HomeAssistant, navigate } from "custom-card-helpers";
import { css, html, LitElement, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("knx-custom-panel")
export class KNXCustomPanel extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;
  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  private navigationService: NavigationService = new NavigationService();

  protected firstUpdated() {
    window.addEventListener("location-changed", () => {
      this.requestUpdate();
    });
    HomeAssistantComponentLoader.loadForm().then(() => {
      this.requestUpdate();
    });
    this.requestUpdate();
  }

  protected render(): TemplateResult | void {
    if (!customElements.get("ha-app-layout")) {
      return html`Preparing the awesome...`;
    }

    const route = this.navigationService.getActiveRoute();

    return html`
      <ha-app-layout>
        <app-header fixed slot="header">
          <app-toolbar>
            <ha-menu-button
              .hass=${this.hass}
              .narrow=${this.narrow}
            ></ha-menu-button>
            <div main-title>KNX UI</div>
          </app-toolbar>
          <ha-tabs
            scrollable
            attr-for-selected="page-name"
            .selected=${route.name}
            @iron-activate=${this.handleNavigationEvent}
          >
            <paper-tab page-name="overview"> Overview </paper-tab>
            <paper-tab page-name="bus_monitor"> Bus Monitor </paper-tab>
          </ha-tabs>
        </app-header>
      </ha-app-layout>
      <div class="route">
        Render routes here :-) Active route: ${route.name}
      </div>
    `;
  }

  /**
   * Navigates to a new page or scrolls to the top of the current page if current page and requested page matches.
   *
   * @param event iron event
   */
  private handleNavigationEvent(event: any): void {
    this.navigationService
      .getNextRoute(event)
      .then((route) => {
        navigate(null, route);
      })
      .catch(() => {
        scrollTo(0, 0);
      });
  }

  static get styles() {
    return css`
      :host {
        margin-left: 0.2rem;
        margin-right: 0.2rem;
      }

      app-header,
      app-toolbar {
        background-color: var(--app-header-background-color);
        color: var(--app-header-text-color, white);
      }
      app-toolbar {
        height: var(--header-height);
      }
    `;
  }
}
