import { mdiFilterVariant, mdiFilterVariantRemove } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleScrollbar } from "@ha/resources/styles";
import "@ha/components/ha-adaptive-dialog";
import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/ha-filter-pane-chip";
import "@ha/components/ha-icon-button";
import { consumeKnxLocalize } from "../localize/consume-knx-localize";
import type { KnxLocalizeFunc } from "../localize/localize";

/**
 * Filter pane of `knx-tabs-subpage-data`: filter controls inline on the start side or in
 * an HA adaptive dialog. An internal part of that layout, not a general-purpose component.
 * Forked from HA's `ha-filter-pane` because it exposes no header-actions slot;
 * replace this fork when upstream supports that slot.
 *
 * Requires HA's internationalization context (provided by `knx-frontend`). The layout
 * owns mounting; the page owns filter values and counts. Close and clear actions only
 * send requests; the pane must be hidden or the filters reset in response.
 * `narrow` selects the adaptive dialog, whose own viewport rules choose a dialog
 * or bottom sheet when mounted. It does not measure this component's width.
 * All events bubble across shadow roots and carry no application payload.
 *
 * @slot - Consumer-owned filter controls.
 * @slot actions - Header actions between the filter chip/title and the clear button.
 * @fires close-filter-pane - Inline toggle clicked or adaptive dialog closed.
 * @fires clear-filter - Clear button clicked; values and visibility remain unchanged here.
 * @cssprop [--ha-filter-pane-width=320px] - Inline pane width; `knx-tabs-subpage-data` supplies 250px
 *   by default through its `--knx-tabs-subpage-data-filter-pane-width` property.
 */
@customElement("knx-tabs-subpage-data-filter-pane")
export class KnxTabsSubpageDataFilterPane extends LitElement {
  /** True renders an adaptive dialog; false renders an inline filter pane. */
  @property({ type: Boolean, reflect: true }) public narrow = false;
  /** Localized toggle/dialog title; defaults to HA's Filters label. */
  @property() public label?: string;
  /** SVG path for the inline filter toggle icon. */
  @property() public path = mdiFilterVariant;
  /** Active-filter count; a nonzero value exposes the clear action. */
  @property({ type: Number }) public count = 0;
  /** Result count in the dialog's close button; undefined uses the generic Close label. */
  @property({ attribute: false }) public resultCount?: number;
  /** Disables the inline toggle and clear action, not dialog dismissal or slotted controls. */
  @property({ type: Boolean }) public disabled = false;

  @state()
  @consumeKnxLocalize()
  private _localize!: KnxLocalizeFunc;

  /** Renders the same filter/action slots inline or in a dialog with a result-count footer. */
  protected render() {
    const label = this.label ?? this._localize("ui.components.subpage-data-table.filters");

    if (this.narrow) {
      return html`<ha-adaptive-dialog open flexcontent .headerTitle=${label} @closed=${this._close}>
        <div class="sheet-actions" slot="headerActionItems"><slot name="actions"></slot></div>
        ${this._renderClearButton("headerActionItems")}
        <div class="sheet-content"><slot></slot></div>
        <ha-dialog-footer slot="footer">
          <ha-button slot="primaryAction" data-dialog="close">
            ${
              this.resultCount === undefined
                ? this._localize("ui.common.close")
                : this._localize("ui.components.subpage-data-table.show_results", {
                    number: this.resultCount,
                  })
            }
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>`;
    }

    return html`<div class="header">
        <ha-filter-pane-chip
          active
          .label=${label}
          .path=${this.path}
          .disabled=${this.disabled}
          @click=${this._close}
        ></ha-filter-pane-chip>
        <div class="actions">
          <slot name="actions"></slot>
          ${this._renderClearButton()}
        </div>
      </div>
      <div class="content ha-scrollbar"><slot></slot></div>`;
  }

  /**
   * Returns the clear action only when filters are active.
   * @param slot Optional dialog header slot; omitted for the inline actions container.
   */
  private _renderClearButton(slot?: string) {
    return this.count
      ? html`<ha-icon-button
          slot=${ifDefined(slot)}
          .path=${mdiFilterVariantRemove}
          .disabled=${this.disabled}
          .label=${this._localize("ui.components.subpage-data-table.clear_filter")}
          @click=${this._clear}
        ></ha-icon-button>`
      : nothing;
  }

  /** Requests unmounting after the inline toggle is clicked or the dialog closes. */
  private _close(): void {
    fireEvent(this, "close-filter-pane");
  }

  /** Requests that the page clear its filters; this component does not own their values. */
  private _clear(): void {
    fireEvent(this, "clear-filter");
  }

  static styles = [
    haStyleScrollbar,
    css`
      :host {
        display: flex;
        flex-direction: column;
        flex: 0 0 var(--ha-filter-pane-width, 320px);
        width: var(--ha-filter-pane-width, 320px);
        box-sizing: border-box;
        overflow: hidden;
        border-inline-end: 1px solid var(--divider-color);
      }
      /* The bottom sheet positions itself, so the pane takes no space. */
      :host([narrow]) {
        display: contents;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-4);
        box-sizing: border-box;
        height: 56px;
        flex-shrink: 0;
        padding: 0 16px;
        background: var(--primary-background-color);
        border-bottom: 1px solid var(--divider-color);
      }
      /* Fill the header and never wrap, so the clear button does not change its height. */
      .actions {
        display: flex;
        flex-shrink: 0;
        align-self: stretch;
        align-items: center;
        gap: var(--ha-space-1);
        white-space: nowrap;
      }
      /* HA stretches header actions to the clear button; keep that height fixed. */
      .sheet-actions {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        height: var(--ha-icon-button-size, 48px);
      }
      .content,
      .sheet-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }
      ha-adaptive-dialog {
        --dialog-content-padding: 0;
        /* Fixed height so the sheet does not resize while filtering. */
        --ha-bottom-sheet-height: calc(100dvh - var(--ha-space-12));
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-tabs-subpage-data-filter-pane": KnxTabsSubpageDataFilterPane;
  }
}
