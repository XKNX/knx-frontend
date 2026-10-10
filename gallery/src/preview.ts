import { LitElement, html, css, nothing, render } from "lit";
import { customElement, property, query, queryAll, state } from "lit/decorators";
import { ContextProvider } from "@lit/context";
import { haStyle } from "@ha/resources/styles";
import { narrowViewportContext } from "@ha/data/context";
import { makeDialogManager, closeLastDialog } from "@ha/dialogs/make-dialog-manager";
import { ProvideHassLitMixin } from "@ha/mixins/provide-hass-lit-mixin";
import type { HomeAssistant } from "@ha/types";
import { catalog } from "./catalog";
import { createEnvironment } from "./environment";
import { readMessage } from "./protocol";
import { PreviewSync } from "./preview-state";
import { templateToCode } from "./code";
import { resolveValues } from "./state";
import en from "./localize/en.json";
import { observe } from "./examples/helpers";
import type {
  GalleryConfigureMessage,
  GalleryEnvironment,
  GalleryEvent,
  GalleryExample,
  GalleryMessage,
  GalleryValues,
} from "./types";

@customElement("knx-gallery-preview")
export class KnxGalleryPreview extends ProvideHassLitMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _values: GalleryValues = {};
  @state() private _slots: string[] = [];
  @state() private _error = "";
  @query("[data-gallery-dialog]") private _dialogButton?: HTMLElement;
  @queryAll("*") private _children!: NodeListOf<Element>;
  private _environment?: GalleryEnvironment;
  private _example?: GalleryExample;
  private _componentId = "";
  private _scenarioId = "";
  private _queue = Promise.resolve();
  private _sync?: PreviewSync;
  private _sessionId = new URLSearchParams(location.search).get("session") ?? "";
  private _thumbnail = new URLSearchParams(location.search).has("thumbnail");
  private _heightObserver = new ResizeObserver(() => this._reportHeight());
  private _reportedHeight?: number | null;
  private _overlays = new Set<Element>();
  private _boundsFrame = 0;
  private _boundsLayer?: HTMLDivElement;
  private _boundsObserver = new MutationObserver(() => this._drawBounds());
  private _drawBounds = () => {
    cancelAnimationFrame(this._boundsFrame);
    if (!this.isConnected || !this.hasAttribute("show-bounds")) {
      this._boundsLayer?.remove();
      this._boundsLayer = undefined;
      return;
    }
    if (!this._boundsLayer) {
      this._boundsLayer = document.createElement("div");
      this._boundsLayer.className = "gallery-component-boundaries";
      this._boundsLayer.setAttribute("aria-hidden", "true");
      this._boundsLayer.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
      document.body.append(this._boundsLayer);
    }
    const tags = catalog.find((entry) => entry.meta.id === this._componentId)?.covers;
    const color = getComputedStyle(this).getPropertyValue("--primary-color");
    const rectangles = tags
      ? Array.from(this._children)
          .filter((element) => element.matches(tags.join(",")))
          .filter((element) => getComputedStyle(element).visibility !== "hidden")
          .flatMap((element) => Array.from(element.getClientRects()))
          .filter(({ width, height }) => width > 0 && height > 0)
      : [];
    render(
      rectangles.map(
        ({ x, y, width, height }) =>
          html`<div
            style=${`position:absolute;box-sizing:border-box;left:${x}px;top:${y}px;width:${width}px;height:${height}px;border:2px dashed ${color};`}
          ></div>`,
      ),
      this._boundsLayer,
    );
    // Track scrolling and animated bounds only while this diagnostic is enabled.
    this._boundsFrame = requestAnimationFrame(this._drawBounds);
  };
  // Match home-assistant-main: this is the preview viewport, not the gallery drawer.
  private _media = matchMedia("(max-width: 870px)");
  private _narrow = new ContextProvider(this, {
    context: narrowViewportContext,
    initialValue: this._media.matches,
  });

  public connectedCallback() {
    super.connectedCallback();
    this.addEventListener("hass-automation-editor", this._hostEvent);
    window.addEventListener("message", this._message);
    window.addEventListener("error", this._windowError);
    window.addEventListener("unhandledrejection", this._rejection);
    window.addEventListener("popstate", this._popstate);
    this._media.addEventListener("change", this._resize);
    this._heightObserver.observe(this);
    this._boundsObserver.observe(this, { attributes: true, attributeFilter: ["show-bounds"] });
    if (this.hasAttribute("show-bounds")) this._drawBounds();
    for (const event of ["opened", "closed", "wa-show", "wa-hide"]) {
      this.addEventListener(event, this._overlayChanged, true);
    }
  }
  public disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("hass-automation-editor", this._hostEvent);
    window.removeEventListener("message", this._message);
    window.removeEventListener("error", this._windowError);
    window.removeEventListener("unhandledrejection", this._rejection);
    window.removeEventListener("popstate", this._popstate);
    this._media.removeEventListener("change", this._resize);
    this._heightObserver.disconnect();
    this._boundsObserver.disconnect();
    cancelAnimationFrame(this._boundsFrame);
    this._boundsLayer?.remove();
    this._boundsLayer = undefined;
    this._sync?.dispose();
    for (const event of ["opened", "closed", "wa-show", "wa-hide"]) {
      this.removeEventListener(event, this._overlayChanged, true);
    }
    this._overlays.clear();
    this._environment?.dispose();
    this._example?.dispose?.();
  }
  protected firstUpdated() {
    makeDialogManager(this);
    if (!this._thumbnail) {
      this._sync = new PreviewSync(
        this,
        (previewState, interaction, revision) =>
          this._post({
            channel: "knx-gallery",
            sessionId: this._sessionId,
            type: "preview-state",
            state: previewState,
            interaction,
            revision,
          }),
        (revision) =>
          this._post({
            channel: "knx-gallery",
            sessionId: this._sessionId,
            type: "interaction-start",
            revision,
          }),
        () => this._environment?.fixtureState,
      );
    }
    this._post({ channel: "knx-gallery", sessionId: this._sessionId, type: "ready" });
  }
  private _post(message: GalleryMessage) {
    if (this.isConnected) window.parent.postMessage(message, location.origin);
  }
  private _overlayChanged = (ev: Event) => {
    const target = ev.composedPath()[0];
    if (
      !(target instanceof Element) ||
      !["ha-dialog", "ha-bottom-sheet", "ha-adaptive-popover", "ha-dropdown"].includes(
        target.localName,
      )
    ) {
      return;
    }
    if (ev.type === "opened" || ev.type === "wa-show") this._overlays.add(target);
    else this._overlays.delete(target);
    this._reportHeight();
  };
  private _reportHeight() {
    for (const overlay of this._overlays) {
      if (!overlay.isConnected) this._overlays.delete(overlay);
    }
    // Overlays need a usable viewport, independent of the underlying widget's height.
    const height =
      this.hasAttribute("auto-height") && !this._overlays.size
        ? Math.ceil(this.getBoundingClientRect().height)
        : null;
    if (height === this._reportedHeight) return;
    this._reportedHeight = height;
    this._post({ channel: "knx-gallery", sessionId: this._sessionId, type: "resize", height });
  }
  private _emit = (event: GalleryEvent) => {
    if (!this._sync?.applying) {
      this._post({ channel: "knx-gallery", sessionId: this._sessionId, type: "event", event });
    }
  };
  private _hostEvent = (event: Event) => {
    // fireEvent creates Events in the caller's realm. A replaced iframe must not
    // send its old Event through parent.customPanel into this new preview.
    if (event instanceof Event && this._environment && !this._environment.signal.aborted) {
      observe(this._emit)(event);
    }
  };
  private _fail(error: unknown) {
    this._error = (error instanceof Error ? error.message : String(error)) || en.failed;
    this._post({
      channel: "knx-gallery",
      sessionId: this._sessionId,
      type: "error",
      error: this._error,
    });
  }
  private _windowError = (ev: ErrorEvent) => {
    // Keep native resize diagnostics in the console without unmounting the widget.
    if (
      !ev.error &&
      ev.message === "ResizeObserver loop completed with undelivered notifications."
    ) {
      return;
    }
    this._fail(ev.error ?? ev.message);
  };
  private _rejection = (ev: PromiseRejectionEvent) => this._fail(ev.reason);
  private _popstate = () => {
    void closeLastDialog().catch((error: unknown) => this._fail(error));
  };
  private _resize = () => {
    this._narrow.setValue(this._media.matches);
    this.requestUpdate();
  };
  private _message = (ev: MessageEvent) => {
    const message = readMessage(ev, window.parent, location.origin, this._sessionId);
    if (
      !message ||
      ![
        "configure",
        "auto-height",
        "appearance",
        "preview-state",
        "writer",
        "fixture-telegrams",
      ].includes(message.type)
    ) {
      return;
    }
    // Preserve ordering when controls change while imports or preparation are pending.
    this._queue = this._queue
      .then(() => {
        if (message.type === "configure") return this._configure(message);
        if (message.type === "writer") {
          this._sync?.setWriter(message.active, message.revision);
          return undefined;
        }
        if (message.type === "fixture-telegrams") {
          if (
            message.revision === this._sync?.revision &&
            this._environment?.fixtures.receiveTelegrams(message.telegrams)
          ) {
            this._sync.fixtureChanged();
          }
          return undefined;
        }
        if (message.type === "preview-state") {
          return this._sync?.apply(message.state, message.revision);
        }
        if (message.type === "appearance") {
          this._environment?.applyTheme(message.theme);
          return undefined;
        }
        if (message.type !== "auto-height") return undefined;
        // Changing viewport sizing must preserve values edited inside the example.
        this.toggleAttribute("auto-height", message.enabled);
        this._reportHeight();
        return undefined;
      })
      .catch((error: unknown) => this._fail(error));
  };
  private async _configure(message: GalleryConfigureMessage) {
    if (!this.isConnected) return;
    const entry = catalog.find((item) => item.meta.id === message.componentId)!;
    if (
      this._example &&
      (message.componentId !== this._componentId || message.scenarioId !== this._scenarioId)
    ) {
      throw new Error(en.ui.failed);
    }
    if (!this._environment) {
      const environment = await createEnvironment(
        this,
        this._emit,
        () => this._sync?.fixtureChanged(),
        (telegrams) => {
          if (!this._sync || !this.isConnected) return;
          this._post({
            channel: "knx-gallery",
            sessionId: this._sessionId,
            type: "fixture-telegrams",
            telegrams,
            revision: this._sync.revision,
          });
        },
      );
      if (!this.isConnected) {
        environment.dispose();
        return;
      }
      this._environment = environment;
      environment.canProduce = () => this._sync?.canProduce ?? false;
    }
    if (!this._example) {
      const example = await entry.load();
      if (!this.isConnected) {
        example.dispose?.();
        return;
      }
      await example.prepare?.(this._environment, message.scenarioId);
      if (!this.isConnected) {
        example.dispose?.();
        return;
      }
      if (message.fixtures) this._environment.fixtureState?.apply(message.fixtures);
      this._example = example;
      this._componentId = message.componentId;
      this._scenarioId = message.scenarioId;
    }
    this._environment.applyTheme(message.theme);
    this.toggleAttribute("auto-height", message.autoHeight);
    this._error = "";
    this._values = resolveValues(entry.meta, message.scenarioId, message.overrides);
    this._slots = message.slots;
    await this.updateComplete;
    // Top-level product elements complete their Lit update before acknowledging.
    await Promise.all(
      Array.from(this._children, (element) =>
        element instanceof LitElement ? element.updateComplete : undefined,
      ),
    );
    if (this._thumbnail) {
      this._dialogButton?.style.setProperty("visibility", "hidden");
      this._dialogButton?.dispatchEvent(new Event("gallery-open-dialog"));
    }
    if (!this._error) {
      this._reportHeight();
      this._sync?.capture();
      this._post({ channel: "knx-gallery", sessionId: this._sessionId, type: "rendered" });
    }
  }
  protected render() {
    if (this._error) return html`<p role="alert">${this._error}</p>`;
    if (!this._example || !this._environment) return nothing;
    try {
      const example = this._example.render(
        this._environment,
        this._values,
        this._slots,
        this._emit,
      );
      if (this._thumbnail) return example;
      let code: string;
      try {
        code = templateToCode(example);
      } catch (error) {
        code = `// ${error instanceof Error ? error.message : String(error)}`;
      }
      this._post({ channel: "knx-gallery", sessionId: this._sessionId, type: "code", code });
      return example;
    } catch (error) {
      // Render errors remain visible and the next configure/reset can recover.
      queueMicrotask(() => this._fail(error));
      return nothing;
    }
  }
  static styles = [
    haStyle,
    css`
      :host {
        display: block;
        min-height: 100vh;
        box-sizing: border-box;
        color: var(--primary-text-color);
        background: var(--primary-background-color);
      }
      :host([show-bounds]) {
        --dialog-box-shadow: inset 0 0 0 1px var(--primary-color), var(--wa-shadow-l);
      }
      :host([auto-height]) {
        display: flow-root;
        min-height: 0;
        --gallery-example-height: auto;
        --gallery-subpage-position: relative;
      }
      p[role="alert"] {
        padding: 16px;
        color: var(--error-color);
      }
    `,
  ];
}

export function mountPreview() {
  document.title = en.preview;
  document.body.style.margin = "0";
  render(html`<knx-gallery-preview></knx-gallery-preview>`, document.body);
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-gallery-preview": KnxGalleryPreview;
  }
}
