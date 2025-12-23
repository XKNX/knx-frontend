import memoize from "memoize-one";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/components/ha-wa-dialog";
import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/search-input";
import "@ha/components/ha-md-list";
import "@ha/components/ha-md-list-item";
import "@ha/components/ha-section-title";

import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleDialog } from "@ha/resources/styles";
import type { HomeAssistant } from "@ha/types";
import type { HassDialog } from "@ha/dialogs/make-dialog-manager";

import type { GroupAddress } from "../types/websocket";

export interface KnxGaSelectDialogParams {
  groupAddresses: GroupAddress[];
  title?: string;
  width?: "small" | "medium" | "large" | "full";
  initialSelection?: string;
  onClose?: (address: string | undefined) => void;
}

@customElement("knx-ga-select-dialog")
export class KnxGaSelectDialog extends LitElement implements HassDialog<KnxGaSelectDialogParams> {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _params?: KnxGaSelectDialogParams;

  @state() private _groupAddresses: GroupAddress[] = [];

  @state() private _selected?: string;

  @state() private _filter = "";

  public async showDialog(params: KnxGaSelectDialogParams): Promise<void> {
    this._params = params;
    this._groupAddresses = params.groupAddresses ?? [];
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
    (filter: string, addrs: GroupAddress[]): { title: string; items: GroupAddress[] }[] => {
      const map = new Map<string, GroupAddress[]>();
      const f = filter.trim().toLowerCase();

      for (const ga of addrs) {
        const address = ga.address ?? "";
        const name = ga.name ?? "";
        if (f) {
          const matches = address.toLowerCase().includes(f) || name.toLowerCase().includes(f);
          if (!matches) continue;
        }
        const main = address.split("/", 1)[0] ?? address;
        const key = `${main}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ga);
      }

      const groups = Array.from(map.entries())
        .sort((a, b) => {
          const na = Number(a[0]);
          const nb = Number(b[0]);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
          return a[0].localeCompare(b[0]);
        })
        .map(([key, items]) => ({
          title: `${key}/*`,
          items: items.sort((x, y) =>
            x.address.localeCompare(y.address, undefined, { numeric: true }),
          ),
        }));

      return groups;
    },
  );

  private _dialogClosed(): void {
    this._open = false;
    this._params = undefined;
    this._filter = "";
    this._selected = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params || !this.hass) {
      return nothing;
    }

    const width = this._params.width ?? "medium";
    return html`<ha-wa-dialog
      .hass=${this.hass}
      .open=${this._open}
      width=${width}
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

        ${this._groupAddresses && this._groupAddresses.length
          ? html`<div class="ga-list-container">
              ${this._groupItems(this._filter, this._groupAddresses).map(
                (group) => html`
                  ${group.title
                    ? html`<ha-section-title>${group.title}</ha-section-title>`
                    : nothing}
                  <ha-md-list>
                    ${group.items.map((ga) => {
                      const isSelected = this._selected === ga.address;
                      return html`<ha-md-list-item
                        interactive
                        type="button"
                        value=${ga.address}
                        @click=${this._onSelect}
                        @dblclick=${this._onDoubleClick}
                      >
                        <div class="ga-row ${isSelected ? "selected" : ""}" slot="headline">
                          <div class="ga-address">${ga.address}</div>
                          <div class="ga-name">${ga.name ?? ""}</div>
                        </div>
                      </ha-md-list-item>`;
                    })}
                  </ha-md-list>
                `,
              )}
            </div>`
          : html`<div>No options</div>`}
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

        .ga-list-container {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
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
