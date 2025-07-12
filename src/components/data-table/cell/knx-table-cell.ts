/**
 * Base Table Cell Component
 *
 * A foundational component for table cells that provides:
 * - Consistent layout structure with primary and secondary content slots
 * - Standardized styling for table cell content
 * - Overflow handling with text ellipsis
 * - Flexible container structure for extensions
 *
 * This component serves as the base class for specialized table cells
 * like filterable cells.
 */

import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators";

@customElement("knx-table-cell")
export class KnxTableCell extends LitElement {
  /**
   * Component-specific styles.
   */
  public static styles = [
    css`
      :host {
        display: var(--knx-table-cell-display, block);
      }
      .container {
        padding: 4px 0;
        display: flex;
        align-items: center;
        flex-direction: row;
      }
      .content-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      ::slotted(*) {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      ::slotted(.primary) {
        font-weight: 500;
        margin-bottom: 2px;
      }
      ::slotted(.secondary) {
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ];

  /**
   * Renders the component's DOM structure
   *
   * Provides two named slots:
   * - "primary": Main content (styled with medium font weight)
   * - "secondary": Supporting content (styled with secondary text color)
   *
   * @returns Template with slotted content structure
   */
  protected render() {
    return html`
      <div class="container">
        <div class="content-wrapper">
          <slot name="primary"></slot>
          <slot name="secondary"></slot>
        </div>
      </div>
    `;
  }
}

// ============================================================================
// TypeScript Declarations
// ============================================================================

/**
 * Extend HTMLElementTagNameMap for TypeScript support.
 */
declare global {
  interface HTMLElementTagNameMap {
    "knx-table-cell": KnxTableCell;
  }
}
