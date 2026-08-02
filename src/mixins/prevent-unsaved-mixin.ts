import type { LitElement, PropertyValues } from "lit";

import { isNavigationClick } from "@ha/common/dom/is-navigation-click";
import { mainWindow } from "@ha/common/dom/get_main_window";
import type { Constructor } from "@ha/types";

/**
 * Variant of HAs `PreventUnsavedMixin` that guards the panel window and
 * `mainWindow`.
 *
 * The KNX panel is rendered in an iframe, and events don't cross that boundary:
 * clicks on HAs sidebar or toolbar never reach the panels `window`, while
 * clicks inside the panel never reach `mainWindow`. Listening on both is needed
 * to catch every way out of an editor holding unsaved changes.
 *
 * Only link clicks and unloading the page are covered - navigating back is not,
 * so callers have to await `promptDiscardChanges()` in their own back handlers.
 *
 * Use together with HAs `DirtyStateProviderMixin`, which provides `isDirtyState`.
 */
export const PreventUnsavedMixin = <T extends Constructor<LitElement>>(superClass: T) =>
  class extends superClass {
    private _guardedWindows: Window[] = mainWindow === window ? [window] : [window, mainWindow];

    private _handleClick = async (ev: MouseEvent) => {
      // resolve the target before awaiting - afterwards the composed path is empty
      const target = ev.composedPath()[0];
      if (!isNavigationClick(ev)) {
        return;
      }
      // `isNavigationClick` prevented the default - the click is replayed when confirmed
      if (!(await this.promptDiscardChanges())) {
        return;
      }
      this._removeListeners();
      target?.dispatchEvent(new MouseEvent(ev.type, ev));
    };

    private _handleUnload = (ev: BeforeUnloadEvent) => ev.preventDefault();

    private _addListeners() {
      // adding the same listener twice is a no-op, so this can run on every update
      for (const win of this._guardedWindows) {
        win.addEventListener("click", this._handleClick, true);
        win.addEventListener("beforeunload", this._handleUnload);
      }
    }

    private _removeListeners() {
      for (const win of this._guardedWindows) {
        win.removeEventListener("click", this._handleClick, true);
        win.removeEventListener("beforeunload", this._handleUnload);
      }
    }

    protected willUpdate(changedProperties: PropertyValues<this>): void {
      super.willUpdate(changedProperties);

      if (this.hasUnsavedChanges()) {
        this._addListeners();
      } else {
        this._removeListeners();
      }
    }

    public disconnectedCallback(): void {
      super.disconnectedCallback();

      this._removeListeners();
    }

    /**
     * Override to report pending changes - typically `isDirtyState` of
     * `DirtyStateProviderMixin`, plus editor input that never reached the config.
     */
    protected hasUnsavedChanges(): boolean {
      return false;
    }

    /** Override to ask the user. Return `true` to leave, `false` to stay. */
    protected async promptDiscardChanges(): Promise<boolean> {
      return true;
    }
  };
