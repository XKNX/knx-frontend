import type { LitElement } from "lit";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators";

import { applyThemesOnElement } from "@ha/common/dom/apply_themes_on_element";
import { fireEvent } from "@ha/common/dom/fire_event";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { listenMediaQuery } from "@ha/common/dom/media_query";
import { computeRTL, computeDirectionStyles } from "@ha/common/util/compute_rtl";
import { navigate } from "@ha/common/navigate";
import { makeDialogManager } from "@ha/dialogs/make-dialog-manager";
import "@ha/resources/append-ha-style";
import type { HomeAssistant, Route } from "@ha/types";

import { KnxElement } from "./knx";
import "./knx-router";
import type { KNX } from "./types/knx";
import type { LocationChangedEvent } from "./types/navigation";

declare global {
  // for fire event
  interface HASSDomEvents {
    "knx-reload": undefined;
  }
}

@customElement("knx-frontend")
class KnxFrontend extends KnxElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public narrow!: boolean;

  @property({ attribute: false }) public route!: Route;

  protected async firstUpdated(_changedProps) {
    if (!this.hass) {
      return;
    }
    if (!this.knx) {
      await this._initKnx();
    }
    await this.hass.loadBackendTranslation("config_panel", "knx", false);
    await this.hass.loadBackendTranslation("selector", "knx", false);
    await this.hass.loadBackendTranslation("title", this.knx.supportedPlatforms, false);
    await this.hass.loadBackendTranslation("selector", this.knx.supportedPlatforms, false);
    await this.hass.loadFragmentTranslation("config");
    this.addEventListener("knx-location-changed", (e) => this._setRoute(e as LocationChangedEvent));

    this.addEventListener("knx-reload", async (_) => {
      this.knx.log.debug("Reloading KNX object");
      await this._initKnx();
    });

    computeDirectionStyles(computeRTL(this.hass), this.parentElement as LitElement);

    document.body.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.shiftKey || ev.metaKey || ev.altKey) {
        // Ignore if modifier keys are pressed
        return;
      }
      if (["a", "c", "d", "e", "m"].includes(ev.key)) {
        // @ts-ignore
        fireEvent(mainWindow, "hass-quick-bar-trigger", ev, {
          bubbles: false,
        });
      }
    });

    listenMediaQuery("(prefers-color-scheme: dark)", (_matches) => {
      this._applyTheme();
    });

    makeDialogManager(this, this.shadowRoot!);
  }

  protected render() {
    if (!this.hass || !this.knx) {
      return html`<p>Loading...</p>`;
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

  static styles =
    // apply "Settings" style toolbar color for `hass-subpage`
    css`
      :host {
        --app-header-background-color: var(--sidebar-background-color);
        --app-header-text-color: var(--sidebar-text-color);
        --app-header-border-bottom: 1px solid var(--divider-color);
        --knx-green: #5e8a3a;
        --knx-blue: #2a4691;
      }
    `;

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
