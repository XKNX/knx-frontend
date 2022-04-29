import { NavigationService } from '@services/navigation.service';
import { NavigationEntry, Route } from '@typing/navigation';
import { HomeAssistantComponentLoader } from '@util/load-ha';
import { KNXBusMonitor } from '@views/bus_monitor';
import { KNXOverview } from '@views/overview';
import { HomeAssistant, navigate } from 'custom-card-helpers';
import { css, html, LitElement, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('knx-custom-panel')
export class KNXCustomPanel extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;
  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  private loadedViews = [KNXOverview, KNXBusMonitor]; // We need this so that the compiler also compiles our views...
  private navigationService: NavigationService = new NavigationService();

  protected firstUpdated() {
    window.addEventListener('location-changed', () => {
      this.requestUpdate();
    });
    HomeAssistantComponentLoader.loadForm().then(() => {
      this.requestUpdate();
    });
    this.requestUpdate();
  }

  protected render(): TemplateResult | void {
    if (!customElements.get('ha-app-layout')) {
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
      <div class="route">${this.getViewForRoute(route)}</div>
    `;
  }

  private getViewForRoute(route: Route) {
    const page = route.name;

    switch (page) {
      case NavigationEntry.OVERVIEW:
        return html`
          <knx-overview
            .hass=${this.hass}
            .narrow=${this.narrow}
          ></knx-overview>
        `;
      case NavigationEntry.BUS_MONITOR:
        return html`
          <knx-bus-monitor
            .hass=${this.hass}
            .narrow=${this.narrow}
          ></knx-bus-monitor>
        `;
      default:
        return html`
          <ha-card header="404">
            <div class="card-content">
              This page is not yet implemented, sorry! :-(
            </div>
          </ha-card>
        `;
    }
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

      .route {
        margin: 0.5rem;
      }
    `;
  }
}
