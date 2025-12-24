import memoize from "memoize-one";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import "@ha/components/ha-wa-dialog";
import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/search-input";
import "@ha/components/ha-md-list";
import "@ha/components/ha-md-list-item";

import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleDialog } from "@ha/resources/styles";
import type { HomeAssistant } from "@ha/types";
import type { HassDialog } from "@ha/dialogs/make-dialog-manager";

import type { GroupAddress, GroupRange, KNXProject } from "../types/websocket";
import type { KNX } from "../types/knx";

interface GroupNode {
  title: string;
  items: GroupAddress[];
  depth: number;
  childGroups: GroupNode[];
}

export interface KnxGaSelectDialogParams {
  knx: KNX;
  groupAddresses: GroupAddress[];
  title?: string;
  width?: "small" | "medium" | "large" | "full";
  initialSelection?: string;
  onClose?: (address: string | undefined) => void;
}

@customElement("knx-ga-select-dialog")
export class KnxGaSelectDialog extends LitElement implements HassDialog<KnxGaSelectDialogParams> {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @state() private _open = false;

  @state() private _params?: KnxGaSelectDialogParams;

  @state() private _groupAddresses: GroupAddress[] = [];

  @state() private _selected?: string;

  @state() private _filter = "";

  public async showDialog(params: KnxGaSelectDialogParams): Promise<void> {
    this._params = params;
    this._groupAddresses = params.groupAddresses ?? [];
    this.knx = params.knx;
    this._selected = params.initialSelection ?? this._selected;
    this._open = true;
  }

  public closeDialog(_historyState?: any): boolean {
    this._dialogClosed();
    return true;
  }

  private _cancel(): void {
    this._selected = undefined;
    if (this._params?.onClose) {
      this._params.onClose(undefined);
    }
    this._dialogClosed();
  }

  private _confirm(): void {
    if (this._params?.onClose) {
      this._params.onClose(this._selected);
    }
    this._dialogClosed();
  }

  private _onDoubleClick(ev: Event): void {
    const target = ev.currentTarget as HTMLElement;
    const value = target.getAttribute("value") ?? (target.dataset && target.dataset.value);
    this._selected = value ?? undefined;
    if (this._selected) {
      this._confirm();
    }
  }

  private _onSelect(ev: Event): void {
    const target = ev.currentTarget as HTMLElement;
    const value = target.getAttribute("value") ?? (target.dataset && target.dataset.value);
    this._selected = value ?? undefined;
  }

  private _onFilterChanged(ev: CustomEvent<{ value: string }>): void {
    this._filter = ev.detail?.value ?? "";
  }

  private _groupItems = memoize(
    (filter: string, addrs: GroupAddress[], projectData: KNXProject | null): GroupNode[] => {
      const f = filter.trim().toLowerCase();

      // Abort when no project data is available
      if (!projectData || !projectData.group_ranges) {
        return [];
      }

      // Filter addresses by search term first
      const filtered = addrs.filter((ga) => {
        if (!f) return true;
        const address = ga.address ?? "";
        const name = ga.name ?? "";
        return address.toLowerCase().includes(f) || name.toLowerCase().includes(f);
      });

      const buildHierarchy = (ranges: Record<string, GroupRange>, depth = 0): GroupNode[] => {
        const nodes: GroupNode[] = [];

        Object.entries(ranges).forEach(([key, range]) => {
          const groupAddresses = (range.group_addresses ?? []) as string[];
          const gaFilteredInRange = filtered.filter((ga) => groupAddresses.includes(ga.address));
          const childGroups = range.group_ranges
            ? buildHierarchy(range.group_ranges, depth + 1)
            : [];
          const includeNode = gaFilteredInRange.length > 0 || childGroups.length > 0;
          if (includeNode) {
            nodes.push({
              title: `${key} ${range.name}`.trim(),
              items: gaFilteredInRange.sort((x, y) => x.raw_address - y.raw_address),
              depth,
              childGroups,
            });
          }
        });

        return nodes;
      };

      return buildHierarchy(projectData.group_ranges);
    },
  );

  private _dialogClosed(): void {
    this._open = false;
    this._params = undefined;
    this._filter = "";
    this._selected = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _renderGroup(group: GroupNode) {
    return html`
      <div class="group-section">
        <div class="group-title" style="--group-depth: ${group.depth}">${group.title}</div>
        ${group.items.length > 0
          ? html`<ha-md-list>
              ${group.items.map((ga) => {
                const isSelected = this._selected === ga.address;
                return html`<ha-md-list-item
                  interactive
                  type="button"
                  value=${ga.address}
                  @click=${this._onSelect}
                  @dblclick=${this._onDoubleClick}
                >
                  <div class=${classMap({ "ga-row": true, selected: isSelected })} slot="headline">
                    <div class="ga-address">${ga.address}</div>
                    <div class="ga-name">${ga.name ?? ""}</div>
                  </div>
                </ha-md-list-item>`;
              })}
            </ha-md-list>`
          : nothing}
        ${group.childGroups.map((child) => this._renderGroup(child))}
      </div>
    `;
  }

  protected render() {
    if (!this._params || !this.hass) {
      return nothing;
    }

    const noProjectData = !this.knx.projectData?.group_ranges;
    const hasAddresses = this._groupAddresses?.length > 0;

    return html`<ha-wa-dialog
      .hass=${this.hass}
      .open=${this._open}
      width=${this._params.width ?? "medium"}
      .headerTitle=${this._params.title}
      @closed=${this._dialogClosed}
    >
      <div class="dialog-body">
        <search-input
          ?autofocus=${true}
          .hass=${this.hass}
          .filter=${this._filter}
          @value-changed=${this._onFilterChanged}
          .label=${this.hass.localize("ui.common.search")}
        ></search-input>

        <div class="ga-list-container">
          ${noProjectData || !hasAddresses
            ? html`<div class="empty-state">
                ${this.hass.localize(
                  "component.knx.config_panel.entities.create._.knx.knx_group_address.group_address_none_for_filter",
                )}
              </div>`
            : this._groupItems(this._filter, this._groupAddresses, this.knx.projectData).map(
                (group) => this._renderGroup(group),
              )}
        </div>
      </div>

      <ha-dialog-footer slot="footer">
        <ha-button slot="secondaryAction" appearance="plain" @click=${this._cancel}>
          ${this.hass.localize("ui.common.cancel")}
        </ha-button>
        <ha-button slot="primaryAction" @click=${this._confirm} .disabled=${!this._selected}>
          ${this.hass.localize("ui.common.ok")}
        </ha-button>
      </ha-dialog-footer>
    </ha-wa-dialog>`;
  }

  static get styles() {
    return [
      haStyleDialog,
      css`
        @media all and (min-width: 600px) {
          ha-wa-dialog {
            --mdc-dialog-min-width: 360px;
          }
        }

        .dialog-body {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2, 8px);
          height: 100%;
          min-height: 0;
        }

        search-input {
          display: block;
          width: 100%;
        }

        ha-md-list {
          padding: 0;
        }

        .ga-list-container {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          padding: 0;
        }

        .group-title {
          position: sticky;
          top: calc(var(--group-title-height, 40px) * min(1, var(--group-depth, 0)));
          z-index: calc(10 - var(--group-depth, 0));
          height: var(--group-title-height, 40px);
          box-sizing: border-box;
          display: flex;
          align-items: center;
          font-weight: 600;
          padding: 6px 8px;
          padding-left: calc(8px + var(--group-depth, 0) * 8px);
          color: var(--primary-text-color);
          background: var(--primary-background-color);
          border-bottom: 1px solid var(--divider-color);
        }

        .empty-state {
          padding: 12px;
          color: var(--secondary-text-color);
          font-style: italic;
        }

        .ga-row {
          display: grid;
          grid-template-columns: 10ch minmax(0, 1fr);
          align-items: center;
          gap: var(--ha-space-2, 8px);
          padding: 6px 8px;
          border-radius: 4px;
        }

        .ga-row.selected {
          background-color: rgba(var(--rgb-primary-color), 0.08);
          outline: 2px solid rgba(var(--rgb-accent-color), 0.12);
        }

        .ga-address {
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Courier New", monospace;
          width: 100%;
          color: var(--secondary-text-color);
          white-space: nowrap;
        }

        .ga-name {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-ga-select-dialog": KnxGaSelectDialog;
  }
}
