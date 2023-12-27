import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-selector/ha-selector";
import { fireEvent } from "@ha/common/dom/fire_event";
import { HomeAssistant } from "@ha/types";

import { KNX } from "../types/knx";
import { DPT, KNXProject, GroupAddress } from "../types/websocket";
import { GASchema } from "../types/entity_data";

interface GroupAddressSelectorOptions {
  read?: { required: boolean };
  send?: { required: boolean };
  passive?: boolean;
  validDPTs: DPT[];
}

const isValidGroupAddress = (gaDPT: DPT, validDPT: DPT): boolean =>
  gaDPT.main === validDPT.main && validDPT.sub ? gaDPT.sub === validDPT.sub : true;

const validGroupAddresses = (knxproject: KNXProject, validDPTs: DPT[]): GroupAddress[] =>
  Object.values(knxproject.group_addresses).filter((groupAddress) =>
    groupAddress.dpt
      ? validDPTs.some((testDPT) => isValidGroupAddress(groupAddress.dpt!, testDPT))
      : false,
  );

@customElement("knx-group-address-selector")
export class GroupAddressSelector extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ type: Object }) public knx!: KNX;

  @property({ type: Object }) public config: GASchema = {};

  @property({ type: Object }) public options!: GroupAddressSelectorOptions;

  private addressOptions() {
    if (!this.knx.project) {
      return [];
    }
    return validGroupAddresses(this.knx.project.knxproject, this.options.validDPTs).map(
      (groupAddress) => ({
        value: groupAddress.address,
        label: `${groupAddress.address} - ${groupAddress.name}`,
      }),
    );
  }

  render() {
    const addressOptions = this.addressOptions();
    return html`
      ${this.options.send
        ? html`<ha-selector
              .hass=${this.hass}
              .label=${"Send address"}
              .required=${this.options.send.required}
              .selector=${{
                select: { multiple: false, custom_value: true, options: addressOptions },
              }}
              .key=${"send"}
              .value=${this.config.send}
              @value-changed=${this._updateConfig}
            ></ha-selector
            >${this.options.read || this.options.passive
              ? html`<div class="spacer"></div>`
              : nothing}`
        : nothing}
      ${this.options.read
        ? html`<ha-selector
              .hass=${this.hass}
              .label=${"Read address"}
              .required=${this.options.read.required}
              .selector=${{
                select: { multiple: false, custom_value: true, options: addressOptions },
              }}
              .key=${"read"}
              .value=${this.config.read}
              @value-changed=${this._updateConfig}
            ></ha-selector
            >${this.options.passive ? html`<div class="spacer"></div>` : nothing}`
        : nothing}
      ${this.options.passive
        ? html`<ha-selector
            .hass=${this.hass}
            .label=${"Passive addresses"}
            .selector=${{
              select: { multiple: true, custom_value: true, options: addressOptions },
            }}
            .key=${"passive"}
            .value=${this.config.passive}
            @value-changed=${this._updateConfig}
          ></ha-selector>`
        : nothing}
    `;
  }

  private _updateConfig(ev: CustomEvent) {
    ev.stopPropagation();
    const target = ev.target as any;
    const value = ev.detail.value;
    this.config = { ...this.config, [target.key]: value };
    if (true) {
      // validate
      fireEvent(this, "value-changed", { value: this.config });
    }
    this.requestUpdate();
  }

  static styles = css`
    .spacer {
      height: 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-group-address-selector": GroupAddressSelector;
  }
}
