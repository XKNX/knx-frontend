import memoize from "memoize-one";
import { LitElement, html, css, nothing } from "lit";
import { consume, type ContextType } from "@lit/context";
import { customElement, state } from "lit/decorators";

import "@ha/components/ha-dialog";
import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/ha-md-list";
import "@ha/components/ha-md-list-item";
import "@ha/components/ha-section-title";
import "@ha/components/input/ha-input-search";

import { localizeContext } from "@ha/data/context";
import { DialogMixin } from "@ha/dialogs/dialog-mixin";
import { haStyleDialog } from "@ha/resources/styles";
import type { HaInputSearch } from "@ha/components/input/ha-input-search";

import { stringToDpt, compareDpt } from "../utils/dpt";
import type { DPTMetadata } from "../types/websocket";

export interface KnxDptSelectDialogParams {
  dpts: Record<string, DPTMetadata>;
  title?: string;
  width?: "small" | "medium" | "large" | "full";

  /** Optional initial selection to preselect in the dialog */
  initialSelection?: string;

  /** Optional callback invoked when the dialog closes. Receives the selected DPT or undefined. */
  onClose?: (dpt: string | undefined) => void;
}

@customElement("knx-dpt-select-dialog")
export class KnxDptSelectDialog extends DialogMixin(LitElement)<KnxDptSelectDialogParams> {
  @state() private dpts: Record<string, DPTMetadata> = {};

  /** Currently selected DPT */
  @state() private _selected?: string;

  /** Filter string for the DPT list */
  @state() private _filter = "";

  @state()
  @consume({ context: localizeContext, subscribe: true })
  private localize!: ContextType<typeof localizeContext>;

  public connectedCallback() {
    super.connectedCallback();

    if (this.params) {
      this.dpts = this.params.dpts ?? {};
      this._selected = this.params.initialSelection ?? this._selected;
    }
  }

  private _cancel(): void {
    this._selected = undefined;
    // Inform caller via callback that dialog was closed without a selection
    if (this.params?.onClose) {
      this.params.onClose(undefined);
    }
    this.closeDialog();
  }

  private _confirm(): void {
    // If a callback was provided by the caller, call it with the selected value.
    if (this.params?.onClose) {
      this.params.onClose(this._selected);
    }
    this.closeDialog();
  }

  private _itemKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Enter") {
      ev.preventDefault();
      const target = ev.currentTarget as HTMLElement;
      const value = target.getAttribute("value");
      this._selected = value ?? undefined;
      this._confirm();
    }
  }

  private _onDoubleClick(ev: Event): void {
    const target = ev.currentTarget as HTMLElement;
    const value = target.getAttribute("value");
    this._selected = value ?? undefined;

    if (this._selected) {
      this._confirm();
    }
  }

  private _onSelect(ev: Event): void {
    const target = ev.currentTarget as HTMLElement;
    const value = target.getAttribute("value");
    this._selected = value ?? undefined;
  }

  private _onFilterChanged(ev: InputEvent): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _groupDpts = memoize(
    (filter: string, dpts: Record<string, DPTMetadata>): { title: string; items: string[] }[] => {
      const map = new Map<string, string[]>();

      const filterLower = filter.trim().toLowerCase();

      for (const dpt of Object.keys(dpts)) {
        const info = this._getDptInfo(dpt);
        // If a filter is provided, match against number, label or unit
        if (filterLower) {
          const matchesNumber = dpt.toLowerCase().includes(filterLower);
          const matchesLabel = info.label?.toLowerCase().includes(filterLower);
          const matchesUnit = info.unit ? info.unit.toLowerCase().includes(filterLower) : false;
          if (!matchesNumber && !matchesLabel && !matchesUnit) {
            continue;
          }
        }

        const major = String(dpt).split(".", 1)[0] || dpt;
        const key = `${major}`;
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)!.push(dpt);
      }

      // Sort groups by numeric major value if possible; within each group sort by minor number
      const groups = Array.from(map.entries())
        .sort((a, b) => {
          const na = Number(a[0]);
          const nb = Number(b[0]);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) {
            return na - nb;
          }
          return a[0].localeCompare(b[0]);
        })
        .map(([key, items]) => ({
          title: `${key}.*`,
          items: items.sort((x, y) => {
            const parsedX = stringToDpt(x);
            const parsedY = stringToDpt(y);
            if (parsedX && parsedY) {
              return compareDpt(parsedX, parsedY);
            }
            if (parsedX) {
              return -1;
            }
            if (parsedY) {
              return 1;
            }
            return x.localeCompare(y);
          }),
        }));

      return groups;
    },
  );

  private _getDptInfo(dpt: string): { label: string; unit: string } {
    const meta = this.dpts[dpt];
    return {
      label:
        this.localize(`component.knx.config_panel.dpt.options.${dpt.replace(".", "_")}`) ??
        meta?.name ??
        this.localize("state.default.unknown"),
      unit: meta?.unit ?? "",
    };
  }

  protected render() {
    if (!this.params) {
      return nothing;
    }

    const width = this.params.width ?? "medium";
    return html` <ha-dialog
      open
      width=${width}
      .headerTitle=${this.params.title}
      @closed=${this.closeDialog}
    >
      <div class="dialog-body">
        <ha-input-search .value=${this._filter} @input=${this._onFilterChanged}></ha-input-search>

        ${Object.keys(this.dpts).length
          ? html`<div class="dpt-list-container">
              ${this._groupDpts(this._filter, this.dpts).map(
                (group) => html`
                  ${group.title
                    ? html`<ha-section-title>${group.title}</ha-section-title>`
                    : nothing}
                  <ha-md-list>
                    ${group.items.map((dpt) => {
                      const info = this._getDptInfo(dpt);
                      const isSelected = this._selected === dpt;
                      return html`<ha-md-list-item
                        interactive
                        type="button"
                        value=${dpt}
                        @click=${this._onSelect}
                        @dblclick=${this._onDoubleClick}
                        @keydown=${this._itemKeydown}
                      >
                        <div class="dpt-row ${isSelected ? "selected" : ""}" slot="headline">
                          <div class="dpt-number">${dpt}</div>
                          <div class="dpt-name">${info.label}</div>
                          <div class="dpt-unit">${info.unit}</div>
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
          ${this.localize("ui.common.cancel") ?? "Cancel"}
        </ha-button>
        <ha-button slot="primaryAction" @click=${this._confirm} .disabled=${!this._selected}>
          ${this.localize("ui.common.ok") ?? "OK"}
        </ha-button>
      </ha-dialog-footer>
    </ha-dialog>`;
  }

  static get styles() {
    return [
      haStyleDialog,
      css`
        @media all and (min-width: 600px) {
          ha-dialog {
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

        .dpt-list-container {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
        }

        .dpt-row {
          display: grid;
          grid-template-columns: 8ch minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--ha-space-2, 8px);
          padding: 6px 8px;
          border-radius: 4px;
        }

        .dpt-row.selected {
          background-color: rgba(var(--rgb-primary-color), 0.08);
          outline: 2px solid rgba(var(--rgb-accent-color), 0.12);
        }

        .dpt-number {
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Courier New", monospace;
          width: 100%;
          color: var(--secondary-text-color);
          white-space: nowrap;
        }

        .dpt-name {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }

        .dpt-unit {
          text-align: right;
          color: var(--secondary-text-color);
          white-space: nowrap;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-dpt-select-dialog": KnxDptSelectDialog;
  }
}
