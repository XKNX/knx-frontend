import { html, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators";
import { applyThemesOnElement } from "../homeassistant-frontend/src/common/dom/apply_themes_on_element";
import { navigate } from "../homeassistant-frontend/src/common/navigate";
import { makeDialogManager } from "../homeassistant-frontend/src/dialogs/make-dialog-manager";
import "../homeassistant-frontend/src/resources/ha-style";
import { HomeAssistant, Route } from "../homeassistant-frontend/src/types";
import { knxElement } from "./knx";
import "./knx-router";
import { LocationChangedEvent } from "./types/navigation";

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
    //this.knx.language = this.hass.language;
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
      <knx-router
        .hass=${this.hass}
        .knx=${this.knx}
        .route=${this.route}
        .narrow=${this.narrow}
      ></knx-router>
    `;
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
