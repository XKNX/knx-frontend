import { css, CSSResultGroup, html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";

import { fireEvent } from "@ha/common/dom/fire_event";

import { GroupRange, KNXProject } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-project-tree-view");

declare global {
  // for fire event
  interface HASSDomEvents {
    "knx-group-range-selection-changed": GroupRangeSelectionChangedEvent;
  }
}

export interface GroupRangeSelectionChangedEvent {
  groupAddresses: string[];
}

interface RangeInfo {
  selected: boolean;
  groupAddresses: string[];
}

@customElement("knx-project-tree-view")
export class KNXProjectTreeView extends LitElement {
  @property({ reflect: false }) data!: KNXProject;

  @state() _selectedRanges: GroupRange[] = [];

  @state() private _selectableRanges: { [key: string]: RangeInfo } = {};

  connectedCallback() {
    super.connectedCallback();

    const initSelectableRanges = (data: { [key: string]: GroupRange }) => {
      Object.entries(data).forEach(([key, groupRange]) => {
        if (groupRange.group_addresses.length > 0) {
          this._selectableRanges[key] = {
            selected: false,
            groupAddresses: groupRange.group_addresses,
          };
        }
        initSelectableRanges(groupRange.group_ranges);
      });
    };
    initSelectableRanges(this.data.group_ranges);
    logger.log("ragnes", this._selectableRanges);
  }

  protected render(): TemplateResult {
    return html`<div class="container ha-tree-view">
      ${this._recurseData(this.data.group_ranges)}
    </div>`;
  }

  protected _recurseData(data: { [key: string]: GroupRange }): TemplateResult {
    const childTemplates = Object.entries(data).map(([key, groupRange]) => {
      const hasSubRange = Object.keys(groupRange.group_ranges).length > 0;
      const selectable = key in this._selectableRanges;

      const checkbox = selectable
        ? html`<input
            type="checkbox"
            .id=${key}
            .checked=${this._selectableRanges[key].selected}
            @change=${this._selectionChanged}
          />`
        : nothing;
      const _rangeName = key + " - " + groupRange.name;
      const rangeContent = selectable
        ? html`<label>${checkbox} ${_rangeName}</label>`
        : html`${_rangeName}`;

      if (hasSubRange) {
        const subselected = Object.keys(groupRange.group_ranges).reduce(
          (accumulator, rangeKey) =>
            rangeKey in this._selectableRanges
              ? this._selectableRanges[rangeKey].selected
                ? accumulator + 1
                : accumulator
              : accumulator,
          0,
        );
        return html`<details>
          <summary>${rangeContent} ${subselected ? "(" + subselected + ")" : nothing}</summary>
          ${this._recurseData(groupRange.group_ranges)}
        </details>`;
      }
      return html`${rangeContent}`;
    });
    return html`${childTemplates}`;
  }

  private _selectionChanged(ev) {
    const rangeKey = ev.target.id;
    this._selectableRanges[rangeKey].selected = !this._selectableRanges[rangeKey].selected;
    this._selectionUpdate();
    this.requestUpdate();
  }

  private _selectionUpdate() {
    const _gaOfSelectedRanges = Object.values(this._selectableRanges).reduce(
      (result, rangeInfo) =>
        rangeInfo.selected ? result.concat(rangeInfo.groupAddresses) : result,
      [] as string[],
    );
    logger.debug("selection changed", _gaOfSelectedRanges);
    fireEvent(this, "knx-group-range-selection-changed", { groupAddresses: _gaOfSelectedRanges });
  }

  static get styles(): CSSResultGroup {
    return css`
      details {
        margin-left: 10pt;
        display: block;
      }
      summary:hover,
      p:hover {
        background-color: rgba(var(--rgb-primary-text-color), 0.1);
      }
      summary {
        margin-left: 10pt;
        display: block;
      }
      label {
        margin-left: 20pt;
        display: block;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-tree-view": KNXProjectTreeView;
  }
}
