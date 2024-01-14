import { mdiNetworkOutline, mdiSwapHorizontalCircle } from "@mdi/js";
import { css, CSSResultGroup, html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { consume } from "@lit-labs/context";

import "@ha/components/ha-svg-icon";

import { KNXProject, CommunicationObject } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";
import { dragDropContext, type DragDropContext } from "../utils/drag-drop-context";

const logger = new KNXLogger("knx-project-device-tree");

interface DeviceTreeItem {
  ia: string;
  name: string;
  manufacturer: string;
  noChannelComObjects: CommunicationObject[];
  channels: Record<string, { name: string; comObjects: CommunicationObject[] }>;
}

@customElement("knx-project-device-tree")
export class KNXProjectDeviceTree extends LitElement {
  @consume({ context: dragDropContext }) _dragDropContext?: DragDropContext;

  @property({ attribute: false }) data!: KNXProject;

  @property({ attribute: false }) multiselect = false;

  @state() private _selectedDevice?: DeviceTreeItem;

  deviceTree: DeviceTreeItem[] = [];

  connectedCallback() {
    super.connectedCallback();
    this.deviceTree = Object.values(this.data.devices).map((device) => {
      const noChannelComObjects: CommunicationObject[] = [];
      const channels = Object.fromEntries(
        Object.entries(device.channels).map(([key, ch]) => [
          key,
          { name: ch.name, comObjects: [] as CommunicationObject[] },
        ]),
      );

      for (const comObjectId of device.communication_object_ids) {
        const comObject = this.data.communication_objects[comObjectId];
        if (!comObject.channel) {
          noChannelComObjects.push(comObject);
        } else {
          channels[comObject.channel].comObjects = (
            channels[comObject.channel].comObjects || []
          ).concat([comObject]);
        }
      }
      return {
        ia: device.individual_address,
        name: device.name,
        manufacturer: device.manufacturer_name,
        noChannelComObjects,
        channels,
      };
    });
  }

  protected render(): TemplateResult {
    return html`<div class="device-tree-view">
      ${this._selectedDevice
        ? this._renderSelectedDevice(this._selectedDevice)
        : this._renderDevices()}
    </div>`;
  }

  private _renderDevices(): TemplateResult {
    return html`<ul class="devices">
      ${repeat(
        this.deviceTree,
        (device) => device.ia,
        (device) =>
          html`<li @click=${this._selectDevice} .device=${device}>
            ${this._renderDevice(device)}
          </li>`,
      )}
    </ul>`;
  }

  private _renderDevice(device: DeviceTreeItem): TemplateResult {
    return html`<div>
      <span class="icon ia">
        <ha-svg-icon .path=${mdiNetworkOutline}></ha-svg-icon>
        <span>${device.ia}</span>
      </span>
      <div>
        <p>${device.manufacturer}</p>
        <p>${device.name}</p>
      </div>
    </div>`;
  }

  private _renderSelectedDevice(device: DeviceTreeItem): TemplateResult {
    return html`<ul class="selected-device">
      <li>${this._renderDevice(device)}</li>
      ${this._renderChannels(device)}
    </ul>`;
  }

  private _renderChannels(device: DeviceTreeItem): TemplateResult {
    return html`${this._renderComObjects(device.noChannelComObjects)}
    ${repeat(
      Object.entries(device.channels),
      ([chId, _]) => `${device.ia}_ch_${chId}`,
      ([_, channel]) =>
        !channel.comObjects.length
          ? nothing // discard unused channels
          : html`<li class="channel">${channel.name}</li>
              ${this._renderComObjects(channel.comObjects)}`,
    )} `;
  }

  private _renderComObjects(comObjects: CommunicationObject[]): TemplateResult {
    return html`${repeat(
      comObjects,
      (comObject) => `${comObject.device_address}_co_${comObject.number}`,
      (comObject) =>
        html`<li class="com-object">
          <div>
            <span class="icon co"
              ><ha-svg-icon .path=${mdiSwapHorizontalCircle}></ha-svg-icon
              ><span>${comObject.number}</span></span
            >
            <p>
              ${comObject.text}${comObject.function_text ? " - " + comObject.function_text : ""}
            </p>
          </div>
          <ul class="group-addresses">
            ${this._renderGroupAddresses(comObject.group_address_links)}
          </ul>
        </li>`,
    )} `;
  }

  private _renderGroupAddresses(groupAddressLinks: string[]): TemplateResult {
    const groupAddresses = groupAddressLinks.map((ga) => this.data.group_addresses[ga]);
    return html`${repeat(
      groupAddresses,
      (groupAddress) => groupAddress.identifier,
      (groupAddress) =>
        html`<li
          draggable="true"
          @dragstart=${this._dragDropContext?.gaDragStartHandler}
          @dragend=${this._dragDropContext?.gaDragEndHandler}
          .ga=${groupAddress}
        >
          <div>
            <span class="icon ga">
              <span>${groupAddress.address}</span>
            </span>
            <p>${groupAddress.name}</p>
          </div>
        </li>`,
    )} `;
  }

  private _selectDevice(ev: CustomEvent) {
    const device = ev.target.device;
    logger.debug("select device", device);
    this._selectedDevice = device;
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        box-sizing: border-box;
        width: 375px;
        margin: 0;
        height: 100%;
        overflow-y: scroll;
        overflow-x: hidden;
        background-color: var(--sidebar-background-color);
        color: var(--sidebar-menu-button-text-color, --primary-text-color);
        margin-right: env(safe-area-inset-right);
        border-left: 1px solid var(--divider-color);
        padding-left: 8px;
      }

      ul {
        list-style-type: none;
        padding: 0;
      }

      li {
        display: block;
        margin-bottom: 4px;
        & > div {
          /* icon and text */
          display: flex;
          align-items: center;
          pointer-events: none;
          & > div {
            /* optional container for multiple paragraphs */
            min-width: 0;
          }
        }
      }

      li p {
        margin: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      span.icon {
        flex: 0 0 auto;
        /* vertical-align: middle; */
        display: inline-flex;
        align-items: center;

        color: var(--text-primary-color);
        font-size: 1rem;
        font-weight: 700;
        border-radius: 4px;
        padding: 3px 4px;
        margin-right: 4px;

        & > ha-svg-icon {
          float: left;
          width: 16px;
          height: 16px;
          margin-right: 4px;
        }

        & > span {
          flex: 1;
          text-align: center;
        }
      }

      span.ia {
        /* 2-row icon */
        flex-direction: column;
        flex-basis: 64px;
        background-color: var(--label-badge-grey);
        & > ha-svg-icon {
          transform: rotate(90deg);
        }
      }

      span.co {
        flex-basis: 44px;
        background-color: var(--amber-color);
      }

      span.ga {
        flex-basis: 50px;
        background-color: var(--label-badge-grey);
      }

      li.channel {
        border-top: 1px solid var(--divider-color);
        border-bottom: 1px solid var(--divider-color);
        padding: 4px 16px;
        font-weight: 500;
      }

      li[draggable="true"] {
        cursor: grab;
      }

      ul.group-addresses {
        margin-left: 12px;
        margin-bottom: 8px;
        padding-left: 4px;
        padding-top: 4px;
        border-left: 1px solid var(--divider-color);

        & > li:not(:first-child) {
          /* passive addresses for this com-object */
          opacity: 0.75;
        }
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-device-tree": KNXProjectDeviceTree;
  }
}
