import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators";

import { applyThemesOnElement } from "@ha/common/dom/apply_themes_on_element";
import "@ha/layouts/ha-app-layout";
import "@ha/components/ha-top-app-bar-fixed";
import "@ha/components/ha-menu-button";
import "@ha/components/ha-tabs";
import { listenMediaQuery } from "@ha/common/dom/media_query";
import { navigate } from "@ha/common/navigate";
import { makeDialogManager } from "@ha/dialogs/make-dialog-manager";
import "@ha/resources/ha-style";
import { HomeAssistant, Route } from "@ha/types";

import { knxElement } from "./knx";
import "./knx-router";
import { KNX } from "./types/knx";
import { LocationChangedEvent } from "./types/navigation";

@customElement("knx-frontend")
class KnxFrontend extends knxElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public narrow!: boolean;

  @property({ attribute: false }) public route!: Route;

  protected firstUpdated(_changedProps) {
    if (!this.hass) {
      return;
    }
    if (!this.knx) {
      this._initKnx();
    }
    this.addEventListener("knx-location-changed", (e) => this._setRoute(e as LocationChangedEvent));

    if (this.route.path === "" || this.route.path === "/") {
      navigate("/knx/info", { replace: true });
    }

    listenMediaQuery("(prefers-color-scheme: dark)", (_matches) => {
      this._applyTheme();
    });
    makeDialogManager(this, this.shadowRoot!);
  }

  protected render() {
    if (!this.hass || !this.knx) {
      return nothing;
    }

    return html`
      <knx-router
        .hass=${this.hass}
        .knx=${this.knx}
        .route=${this.route}
        .narrow=${this.narrow}
      ></knx-router>
    `;
  }

  private _setRoute(ev: LocationChangedEvent): void {
    if (!ev.detail?.route) {
      return;
    }
    this.route = ev.detail.route;
    navigate(this.route.path, { replace: true });
    this.requestUpdate();
  }

  private _applyTheme() {
    applyThemesOnElement(
      this.parentElement,
      this.hass.themes,
      this.hass.selectedTheme?.theme ||
        (this.hass.themes.darkMode && this.hass.themes.default_dark_theme
          ? this.hass.themes.default_dark_theme!
          : this.hass.themes.default_theme),
      {
        ...this.hass.selectedTheme,
        dark: this.hass.themes.darkMode,
      },
    );
    this.parentElement!.style.backgroundColor = "var(--primary-background-color)";
    this.parentElement!.style.color = "var(--primary-text-color)";
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-frontend": KnxFrontend;
  }
}
