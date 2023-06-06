import { css, CSSResultGroup } from "lit";
import { customElement } from "lit/decorators";
import { HaDataTable } from "@ha/components/data-table/ha-data-table";

@customElement("knx-data-table")
export class KnxDataTable extends HaDataTable {
  static get styles(): CSSResultGroup {
    return [
      HaDataTable.styles,
      css`
        :host {
          height: calc(100vh - 104px);
        }

        .mdc-data-table__row {
          height: 35px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-data-table": KnxDataTable;
  }
}
