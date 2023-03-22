// import "@polymer/app-layout/app-header/app-header";
// import "@polymer/app-layout/app-toolbar/app-toolbar";
// import "@material/mwc-list/mwc-list-item";
// import "@material/mwc-button";
// import "@material/mwc-fab";
import { html, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators";
import { applyThemesOnElement } from "@ha/common/dom/apply_themes_on_element";
import { navigate } from "@ha/common/navigate";
import { makeDialogManager } from "@ha/dialogs/make-dialog-manager";
import "@ha/resources/ha-style";
import "@ha/components/ha-tabs";
import "@ha/components/ha-menu-button";
import "@ha/layouts/ha-app-layout";
import "@ha/layouts/hass-subpage";
import { HomeAssistant, Route } from "@ha/types";
import { knxElement } from "./knx";
import "./knx-router";
import { LocationChangedEvent } from "./types/navigation";
import { haStyle } from "@ha/resources/styles";

@customElement("knx-frontend")
class KnxFrontend extends knxElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public narrow!: boolean;

  @property({ attribute: false }) public route!: Route;

  protected firstUpdated(changedProps) {
    super.firstUpdated(changedProps);
    if (!this.hass) {
      return;
    }
    if (!this.knx) {
      this._getKNXConfigEntry();
    }
    // this.knx.language = this.hass.language;
    this.addEventListener("knx-location-changed", (e) => this._setRoute(e as LocationChangedEvent));

    makeDialogManager(this, this.shadowRoot!);
    if (this.route.path === "") {
      navigate("/knx/overview", { replace: true });
    }

    this._applyTheme();
  }

  protected render(): TemplateResult | void {
    if (!this.hass || !this.knx) {
      return html``;
    }

    return html`
      <ha-app-layout>
        <app-header fixed slot="header">
          <app-toolbar>
            <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
            <div main-title>KNX UI</div>
          </app-toolbar>
          <ha-tabs
            scrollable
            attr-for-selected="page-name"
            .selected=${this.route.path}
            @iron-activate=${this.handleNavigationEvent}
          >
            <paper-tab page-name="/knx/overview"> Overview </paper-tab>
            <paper-tab page-name="/knx/monitor"> Bus Monitor </paper-tab>
          </ha-tabs>
        </app-header>
      </ha-app-layout>
      <knx-router
        .hass=${this.hass}
        .knx=${this.knx}
        .route=${this.route}
        .narrow=${this.narrow}
      ></knx-router>
    `;
  }

  private handleNavigationEvent(event: any) {
    const path = event.detail.item.getAttribute("page-name");
    navigate(path, { replace: true });
  }

  static get styles() {
    return haStyle;
  }

  private _setRoute(ev: LocationChangedEvent): void {
    this.route = ev.detail!.route;
    navigate(this.route.path, { replace: true });
    this.requestUpdate();
  }

  private _applyTheme() {
    let options: Partial<HomeAssistant["selectedTheme"]> | undefined;

    const themeName =
      this.hass.selectedTheme?.theme ||
      (this.hass.themes.darkMode && this.hass.themes.default_dark_theme
        ? this.hass.themes.default_dark_theme!
        : this.hass.themes.default_theme);

    options = this.hass.selectedTheme;
    if (themeName === "default" && options?.dark === undefined) {
      options = {
        ...this.hass.selectedTheme,
      };
    }

    applyThemesOnElement(this.parentElement, this.hass.themes, themeName, {
      ...options,
      dark: this.hass.themes.darkMode,
    });
    this.parentElement!.style.backgroundColor = "var(--primary-background-color)";
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-frontend": KnxFrontend;
  }
}
