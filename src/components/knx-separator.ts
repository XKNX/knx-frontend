import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

/**
 * A flexible horizontal separator component with adjustable height.
 *
 * Features:
 * - Adjustable height from minHeight to maxHeight
 * - Slot-based content for maximum flexibility
 *
 * Slots:
 * - default: Main content
 */
@customElement("knx-separator")
export class KnxSeparator extends LitElement {
  /** Current height in pixels */
  @property({ type: Number, reflect: true })
  public height = 1;

  /** Maximum height in pixels (default: 50) */
  @property({ type: Number, attribute: "max-height" })
  public maxHeight = 50;

  /** Minimum height in pixels when collapsed (default: 1) */
  @property({ type: Number, attribute: "min-height" })
  public minHeight = 1;

  /** Transition duration in ms (default: 150) */
  @property({ type: Number, attribute: "animation-duration" })
  public animationDuration = 150;

  /** Additional CSS class */
  @property({ type: String, attribute: "custom-class" })
  public customClass = "";

  @state()
  private _isTransitioning = false;

  /**
   * Set the height with optional animation
   * @param newHeight - Target height in pixels
   * @param animate - Whether to animate the transition (default: true)
   */
  public setHeight(newHeight: number, animate = true): void {
    const constrainedHeight = Math.max(this.minHeight, Math.min(this.maxHeight, newHeight));

    if (!animate) {
      this.height = constrainedHeight;
      return;
    }

    this._isTransitioning = true;
    this.height = constrainedHeight;

    setTimeout(() => {
      this._isTransitioning = false;
    }, this.animationDuration);
  }

  /**
   * Expand to maximum height
   */
  public expand(): void {
    this.setHeight(this.maxHeight);
  }

  /**
   * Collapse to minimum height
   */
  public collapse(): void {
    this.setHeight(this.minHeight);
  }

  /**
   * Toggle between expanded and collapsed state
   */
  public toggle(): void {
    const threshold = this.minHeight + (this.maxHeight - this.minHeight) * 0.5;
    if (this.height <= threshold) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /**
   * Get current expansion ratio (0 = fully collapsed, 1 = fully expanded)
   */
  public get expansionRatio(): number {
    return (this.height - this.minHeight) / (this.maxHeight - this.minHeight);
  }

  protected render() {
    return html`
      <div
        class="separator-container ${this.customClass}"
        style="
          height: ${this.height}px;
          transition: ${this._isTransitioning
          ? `height ${this.animationDuration}ms ease-in-out`
          : "none"};
        "
      >
        <div class="content">
          <slot></slot>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      position: relative;
    }

    .separator-container {
      width: 100%;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
      background: var(--card-background-color, var(--primary-background-color));
    }

    .content {
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
      .separator-container {
        transition: none !important;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-separator": KnxSeparator;
  }
}
