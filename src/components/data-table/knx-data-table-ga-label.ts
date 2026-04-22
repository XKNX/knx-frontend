import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { consume, type ContextType } from "@lit/context";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";

import "@ha/components/chips/ha-chip-set";
import "@ha/components/ha-dropdown";
import "@ha/components/ha-dropdown-item";
import "@ha/components/ha-label";

import { stopPropagation } from "@ha/common/dom/stop_propagation";
import { navigate } from "@ha/common/navigate";
import { localizeContext } from "@ha/data/context";

interface GroupAddressParts {
  address: string;
  name: string | undefined;
}

@customElement("knx-data-table-ga-label")
class KnxDataTableGaLabel extends LitElement {
  @property({ attribute: false }) public groupAddresses: GroupAddressParts[] = [];

  @state()
  @consume({ context: localizeContext, subscribe: true })
  private localize!: ContextType<typeof localizeContext>;

  protected render(): TemplateResult {
    const gas = this.groupAddresses;
    if (gas.length <= 1) {
      return html`
        <ha-chip-set>
          ${repeat(
            gas,
            (ga) => ga.address,
            (ga) => this._renderGA(ga),
          )}
        </ha-chip-set>
      `;
    }

    return html`
      <ha-chip-set>
        <a
          class="link"
          href=${this._groupMonitorHref(gas.map((ga) => ga.address))}
          @click=${this._linkClicked}
        >
          <ha-label dense class="monitor-all">
            ${this.localize("component.knx.config_panel.common.monitor_x_group_addresses", {
              count: gas.length,
            })}
          </ha-label>
        </a>
        <ha-dropdown role="button" tabindex="0" @click=${stopPropagation}>
          <ha-label
            slot="trigger"
            class="open-menu"
            dense
            .description=${this.localize("component.knx.config_panel.common.group_addresses") +
            " (" +
            gas.length +
            ")"}
            >&#8943;</ha-label
          >
          ${repeat(
            gas,
            (ga) => ga.address,
            (ga) => html`
              <ha-dropdown-item .value=${ga.address}>${this._renderGA(ga)}</ha-dropdown-item>
            `,
          )}
        </ha-dropdown>
      </ha-chip-set>
    `;
  }

  private _renderGA(ga: GroupAddressParts) {
    return html`
      <a class="ga link" href=${this._groupMonitorHref([ga.address])} @click=${this._linkClicked}>
        <ha-label dense .description=${ga.name ?? ""}> ${ga.address} </ha-label>
        ${ga.name ? html`<div>${ga.name}</div>` : nothing}
      </a>
    `;
  }

  private _linkClicked(ev: MouseEvent) {
    // Use navigate() for normal clicks to stay in the HA SPA context (avoids iframe double-menu).
    // Middle-click and Ctrl/Cmd+click fall through to the browser to open in a new tab.
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    ev.preventDefault();
    ev.stopPropagation();
    navigate((ev.currentTarget as HTMLAnchorElement).href);
  }

  private _groupMonitorHref(addresses: string[]): string {
    return `/knx/group_monitor?destination=${encodeURIComponent(addresses.join(","))}`;
  }

  static styles = css`
    :host {
      display: block;
      flex-grow: 1;
    }
    ha-chip-set {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: flex-start;
      row-gap: 4px;
    }
    ha-label {
      --ha-label-background-color: var(--knx-green, var(--grey-color));
      --ha-label-background-opacity: 0.5;
      cursor: pointer;
    }
    .link {
      color: inherit;
      text-decoration: none;
    }
    .ga {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .open-menu {
      --ha-label-background-color: transparent;
      border: 1px solid var(--divider-color);
    }

    .monitor-all {
      --ha-label-background-color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-data-table-ga-label": KnxDataTableGaLabel;
  }
}
