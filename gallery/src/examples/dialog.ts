import { html, type LitElement } from "lit";
import "@ha/components/ha-button";
import { fireEvent } from "@ha/common/dom/fire_event";
import { nextRender } from "@ha/common/util/render-status";
import { showDialog, FOCUS_TARGET } from "@ha/dialogs/make-dialog-manager";
import type { ProvideHassElement } from "@ha/mixins/provide-hass-lit-mixin";
import en from "../localize/en.json";
import type { GalleryEnvironment, GalleryEvent } from "../types";
import { observe } from "./helpers";

// Lazy runtime helper shared by the seven examples; never imported by metadata.
export function dialogButton(
  env: GalleryEnvironment,
  emit: (event: GalleryEvent) => void,
  tag: keyof HTMLElementTagNameMap,
  params: unknown,
) {
  const open = async (event: Event) => {
    const button = event.currentTarget as HTMLElement & { [FOCUS_TARGET]?: boolean };
    button[FOCUS_TARGET] = true;
    const host = (button.getRootNode() as ShadowRoot).host as LitElement & ProvideHassElement;
    await showDialog(host, tag, params, async () => undefined);
    if (env.signal.aborted) return;
    const dialog = host.shadowRoot!.querySelector(tag) as LitElement;
    await dialog.updateComplete;
    if (env.signal.aborted) return;
    const on = observe(emit);
    emit({ kind: "event", name: "dialog-opened", timestamp: Date.now(), args: { dialog: tag } });
    const listeners = new AbortController();
    const stop = () => listeners.abort();
    env.signal.addEventListener("abort", stop, { once: true });
    const closed = async (ev: Event) => {
      on(ev);
      stop();
      env.signal.removeEventListener("abort", stop);
      await nextRender();
      if (!env.signal.aborted) button.focus();
    };
    dialog.addEventListener("dialog-closed", closed, { signal: listeners.signal });
    // The legacy create dialog closes ha-dialog but does not notify its manager.
    if (tag === "knx-device-create-dialog") {
      dialog.addEventListener("closed", () => fireEvent(dialog, "dialog-closed", { dialog: tag }), {
        signal: listeners.signal,
      });
    }
    dialog.addEventListener("knx-reload", on, { signal: listeners.signal });
    // Direct listeners retain events stopped by the dialog and non-bubbling detail.
    for (const selector of dialog.shadowRoot!.querySelectorAll(
      "knx-group-address-selector, knx-payload-selector, knx-selector-row",
    )) {
      selector.addEventListener("value-changed", on, { signal: listeners.signal });
    }
  };
  const template = html`<ha-button
    data-gallery-dialog=${tag}
    @gallery-open-dialog=${open}
    @click=${open}
    >${en.dialogs.open}</ha-button
  >`;
  return Object.assign(template, {
    galleryDialog: {
      tag,
      params,
      modulePath:
        tag === "knx-group-monitor-telegram-info-dialog"
          ? "./src/features/group-monitor/dialogs/telegram-info-dialog"
          : `./src/dialogs/${tag}`,
    },
  });
}
