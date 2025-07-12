import { css } from "lit";
import { customElement } from "lit/decorators";
import { HaExpansionPanel } from "@ha/components/ha-expansion-panel";
/**
 * An expansion panel that styles the expanded content container
 * as a flex column with hidden overflow.
 */
@customElement("flex-content-expansion-panel")
export class FlexContentExpansionPanel extends HaExpansionPanel {
  static styles = css`
    /* Inherit base styles */
    ${HaExpansionPanel.styles}

    /* Add specific styles for flex content */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .container.expanded {
      /* Keep original height: auto from base */
      /* Add requested styles */
      overflow: hidden !important;
      display: flex;
      flex-direction: column;
      flex: 1;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "flex-content-expansion-panel": FlexContentExpansionPanel;
  }
}
