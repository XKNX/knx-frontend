import { css, CSSResultGroup, html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";

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
  @property({ attribute: false }) data!: KNXProject;

  @property({ attribute: false }) multiselect = false;

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
    logger.debug("ranges", this._selectableRanges);
  }

  protected render(): TemplateResult {
    return html`<div class="ha-tree-view">${this._recurseData(this.data.group_ranges)}</div>`;
  }

  protected _recurseData(data: { [key: string]: GroupRange }, level: number = 0): TemplateResult {
    const childTemplates = Object.entries(data).map(([key, groupRange]) => {
      const hasSubRange = Object.keys(groupRange.group_ranges).length > 0;
      const empty = !(hasSubRange || groupRange.group_addresses.length > 0);
      if (empty) {
        return nothing;
      }
      const selectable = key in this._selectableRanges;
      const selected = selectable ? this._selectableRanges[key].selected : false;
      const rangeClasses = {
        "range-item": true,
        "root-range": level === 0,
        "sub-range": level > 0,
        selectable: selectable,
        "selected-range": selected,
        "non-selected-range": selectable && !selected,
      };
      const rangeContent = html`<div
        class=${classMap(rangeClasses)}
        toggle-range=${selectable ? key : nothing}
        @click=${selectable
          ? this.multiselect
            ? this._selectionChangedMulti
            : this._selectionChangedSingle
          : nothing}
      >
        <span class="range-key">${key}</span>
        <span class="range-text">${groupRange.name}</span>
      </div>`;

      if (hasSubRange) {
        const groupClasses = {
          "root-group": level === 0,
          "sub-group": level !== 0,
        };
        return html`<div class=${classMap(groupClasses)}>
          ${rangeContent} ${this._recurseData(groupRange.group_ranges, level + 1)}
        </div>`;
      }

      return html`${rangeContent}`;
    });
    return html`${childTemplates}`;
  }

  private _selectionChangedMulti(ev) {
    const rangeKey = (ev.target as Element).getAttribute("toggle-range")!;
    this._selectableRanges[rangeKey].selected = !this._selectableRanges[rangeKey].selected;
    this._selectionUpdate();
    this.requestUpdate();
  }

  private _selectionChangedSingle(ev) {
    const rangeKey = (ev.target as Element).getAttribute("toggle-range")!;
    const rangePreviouslySelected = this._selectableRanges[rangeKey].selected;
    Object.values(this._selectableRanges).forEach((rangeInfo) => {
      rangeInfo.selected = false;
    });
    this._selectableRanges[rangeKey].selected = !rangePreviouslySelected;
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
      :host {
        margin: 0;
        height: 100%;
        overflow-y: scroll;
        overflow-x: hidden;
        background-color: var(--card-background-color);
      }

      .ha-tree-view {
        cursor: default;
      }

      .root-group {
        margin-bottom: 8px;
      }

      .root-group > * {
        padding-top: 5px;
        padding-bottom: 5px;
      }

      .range-item {
        display: block;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-size: 0.875rem;
      }

      .range-item > * {
        vertical-align: middle;
        pointer-events: none;
      }

      .range-key {
        color: var(--text-primary-color);
        font-size: 0.75rem;
        font-weight: 700;
        background-color: var(--label-badge-grey);
        border-radius: 4px;
        padding: 1px 4px;
        margin-right: 2px;
      }

      .root-range {
        padding-left: 8px;
        font-weight: 500;
        background-color: var(--secondary-background-color);

        & .range-key {
          color: var(--primary-text-color);
          background-color: var(--card-background-color);
        }
      }

      .sub-range {
        padding-left: 16px;
      }

      .selectable {
        cursor: pointer;
      }

      .selectable:hover {
        background-color: rgba(var(--rgb-primary-text-color), 0.04);
      }

      .selected-range {
        background-color: rgba(var(--rgb-primary-color), 0.12);

        & .range-key {
          background-color: var(--primary-color);
        }
      }

      .selected-range:hover {
        background-color: rgba(var(--rgb-primary-color), 0.07);
      }

      .non-selected-range {
        background-color: var(--card-background-color);
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-tree-view": KNXProjectTreeView;
  }
}
