import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { stopPropagation } from "@ha/common/dom/stop_propagation";
import { navigate } from "@ha/common/navigate";
import "@ha/components/chips/ha-chip-set";
import "@ha/components/ha-dropdown";
import "@ha/components/ha-dropdown-item";
import "@ha/components/ha-label";

interface GroupAddressParts {
  address: string;
  name: string | undefined;
}

@customElement("knx-data-table-ga-label")
class KnxDataTableGaLabel extends LitElement {
  @property({ attribute: false }) public groupAddresses: GroupAddressParts[] = [];

  protected render(): TemplateResult {
    const gas = this.groupAddresses;
    if (gas.length <= 2) {
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
        ${this._renderGA(gas[0])}
        <ha-dropdown role="button" tabindex="0" @click=${stopPropagation}>
          <ha-label slot="trigger" class="plus" dense> +${gas.length - 1} </ha-label>
          ${repeat(
            gas.slice(1),
            (ga) => ga.address,
            (ga) => html`
              <ha-dropdown-item
                .value=${ga.address}
                @click=${this._gaClicked}
                data-address=${ga.address}
              >
                ${this._renderGA(ga)}
              </ha-dropdown-item>
            `,
          )}
        </ha-dropdown>
      </ha-chip-set>
    `;
  }

  private _renderGA(ga: GroupAddressParts) {
    return html`
      <div class="ga">
        <ha-label
          dense
          .description=${ga.name ?? ""}
          @click=${this._gaClicked}
          data-address=${ga.address}
        >
          ${ga.address} </ha-label
        >${ga.name ? html`<div>${ga.name}</div>` : nothing}
      </div>
    `;
  }

  private _gaClicked(ev: Event) {
    // When a group address label or a dropdown item is clicked.
    ev.stopPropagation();
    const address = (ev.currentTarget as HTMLElement).dataset.address;
    if (!address) return;
    navigate(`/knx/group_monitor?destination=${encodeURIComponent(address)}`);
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
    .ga {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .plus {
      --ha-label-background-color: transparent;
      border: 1px solid var(--divider-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-data-table-ga-label": KnxDataTableGaLabel;
  }
}
