import { mdiNetworkOutline, mdiSwapHorizontalCircle, mdiArrowLeft } from "@mdi/js";
import { css, CSSResultGroup, html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { consume } from "@lit-labs/context";

import "@ha/components/ha-svg-icon";

import { KNXProject, CommunicationObject, COFlags } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";
import { dragDropContext, type DragDropContext } from "../utils/drag-drop-context";
import { dptToString } from "../utils/format";

const logger = new KNXLogger("knx-project-device-tree");

interface DeviceTreeItem {
  ia: string;
  name: string;
  manufacturer: string;
  noChannelComObjects: CommunicationObject[];
  channels: Record<string, { name: string; comObjects: CommunicationObject[] }>;
}

const comObjectFirstGADPT = (knxProject: KNXProject, comObject: CommunicationObject): string => {
  const dpt = dptToString(knxProject.group_addresses[comObject.group_address_links[0]].dpt);
  return dpt ? `DPT ${dpt}` : "";
};

const comObjectFlags = (flags: COFlags): string =>
  // – ar en-dashes
  `${flags.read ? "R" : "–"} ${flags.write ? "W" : "–"} ${flags.transmit ? "T" : "–"} ${
    flags.update ? "U" : "–"
  }`;

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
          html`<li class="clickable" @click=${this._selectDevice} .device=${device}>
            ${this._renderDevice(device)}
          </li>`,
      )}
    </ul>`;
  }

  private _renderDevice(device: DeviceTreeItem): TemplateResult {
    // icon is rotated 90deg so mdiChevronDown -> left
    return html`<div class="item">
      <span class="icon ia">
        <ha-svg-icon .path=${mdiNetworkOutline}></ha-svg-icon>
        <span>${device.ia}</span>
      </span>
      <div class="description">
        <p>${device.manufacturer}</p>
        <p>${device.name}</p>
      </div>
    </div>`;
  }

  private _renderSelectedDevice(device: DeviceTreeItem): TemplateResult {
    return html`<ul class="selected-device">
      <li class="back-item clickable" @click=${this._selectDevice}>
        <div class="item">
          <ha-svg-icon class="back-icon" .path=${mdiArrowLeft}></ha-svg-icon>
          ${this._renderDevice(device)}
        </div>
      </li>
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
          <div class="item">
            <span class="icon co"
              ><ha-svg-icon .path=${mdiSwapHorizontalCircle}></ha-svg-icon
              ><span>${comObject.number}</span></span
            >
            <div class="description">
              <p>
                ${comObject.text}${comObject.function_text ? " - " + comObject.function_text : ""}
              </p>
              <p class="co-info">
                ${comObjectFirstGADPT(this.data, comObject)}<span
                  >${comObjectFlags(comObject.flags)}</span
                >
              </p>
            </div>
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
          <div class="item">
            <span class="icon ga">
              <span>${groupAddress.address}</span>
            </span>
            <p class="description">${groupAddress.name}</p>
          </div>
        </li>`,
    )} `;
  }

  private _selectDevice(ev: CustomEvent) {
    const device = ev.target.device;
    logger.debug("select device", device);
    this._selectedDevice = device;
    this.scrollTop = 0;
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        box-sizing: border-box;
        width: 480px;
        max-width: 100vw;
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
        margin-block-start: 8px;
      }

      li {
        display: block;
        margin-bottom: 4px;
        & div.item {
          /* icon and text */
          display: flex;
          align-items: center;
          pointer-events: none;
          & > div {
            /* optional container for multiple paragraphs */
            min-width: 0;
            width: 100%;
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
        display: inline-flex;
        align-self: stretch;
        align-items: center;

        color: var(--text-primary-color);
        font-size: 1rem;
        font-weight: 700;
        border-radius: 12px;
        padding: 3px 6px;
        margin-right: 4px;

        & > ha-svg-icon {
          float: left;
          width: 16px;
          height: 16px;
          margin-right: 4px;
        }

        & > span {
          /* icon text */
          flex: 1;
          text-align: center;
        }
      }

      span.ia {
        flex-basis: 70px;
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
        flex-basis: 54px;
        background-color: var(--knx-green);
      }

      .description {
        margin-top: 4px;
        margin-bottom: 4px;
      }

      .com-object p.co-info {
        font-size: 0.85rem;
        font-weight: 300;
        & > span {
          float: right;
          margin-right: 12px;
        }
      }

      .back-item {
        margin-left: -8px; /* revert host padding to have gapless border */
        padding-left: 8px;
        margin-top: -8px; /* revert ul margin-block-start to have gapless hover effect */
        padding-top: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--divider-color);
        margin-bottom: 8px;
      }

      .back-icon {
        margin-right: 8px;
        color: var(--label-badge-grey);
      }

      li.channel {
        border-top: 1px solid var(--divider-color);
        border-bottom: 1px solid var(--divider-color);
        padding: 4px 16px;
        font-weight: 500;
      }

      li.clickable:hover {
        background-color: rgba(var(--rgb-primary-text-color), 0.04);
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
