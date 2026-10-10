import { LitElement, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, query, queryAll, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { guard } from "lit/directives/guard";
import { keyed } from "lit/directives/keyed";
import { repeat } from "lit/directives/repeat";
import {
  mdiChevronDown,
  mdiPlus,
  mdiMinus,
  mdiMenu,
  mdiDockRight,
  mdiClose,
  mdiTune,
  mdiBorderOutside,
  mdiRulerSquare,
  mdiLinkVariant,
  mdiOpenInNew,
  mdiCellphone,
  mdiTablet,
  mdiTabletDashboard,
  mdiMonitor,
  mdiUndoVariant,
  mdiWeatherSunny,
  mdiWeatherNight,
  mdiCompare,
  mdiFormSelect,
  mdiMagnify,
  mdiMessageOutline,
  mdiTableFilter,
  mdiViewDashboardOutline,
  mdiViewGridOutline,
  mdiWidgetsOutline,
  mdiArrowCollapseVertical,
} from "@mdi/js";
import "@ha/components/ha-button";
import type { HaButton } from "@ha/components/ha-button";
import "@ha/components/ha-dropdown";
import "@ha/components/ha-dropdown-item";
import type { HaDropdownSelectEvent } from "@ha/components/ha-dropdown";
import "@ha/components/ha-tab-group";
import "@ha/components/ha-tab-group-tab";
import "@ha/components/ha-adaptive-popover";
import "@ha/components/ha-svg-icon";
import "@ha/components/input/ha-input";
import "@ha/components/ha-switch";
import type { HaSelectSelectEvent } from "@ha/components/ha-select";
import { CanvasNavigation, fitScale, stepScale, type CanvasSize } from "./canvas-navigation";
import { galleryUrl } from "./paths";
import { AlignmentGuides } from "./alignment-guides";
import { catalog, catalogGroups, componentRelationships, type CatalogCategory } from "./catalog";
import { mergeFixtureTelegrams, type PreviewState } from "./preview-state";
import { isTelegramHistory } from "./fixtures/telegrams";
import { readMessage } from "./protocol";
import { appendEvent } from "./state";
import { highlightCode } from "./highlight-code";
import { applyGalleryTheme } from "./theme";
import { galleryStyles, shellStyles } from "./styles";
import en from "./localize/en.json";
import type { GalleryConfigureMessage, GalleryEvent, GalleryTheme, GalleryValues } from "./types";
import "./controls";
import "./event-log";
import "./thumbnail";

const modeIcons = { light: mdiWeatherSunny, dark: mdiWeatherNight, compare: mdiCompare };

const devices = [
  { id: "phone", width: 390, icon: mdiCellphone },
  { id: "largePhone", width: 430, icon: mdiCellphone },
  { id: "tablet", width: 768, icon: mdiTablet },
  { id: "landscape", width: 1024, icon: mdiTabletDashboard },
  { id: "desktop", width: 1280, icon: mdiMonitor },
] as const;

interface PreviewDevice {
  id: (typeof devices)[number]["id"] | "custom";
  width: number;
}
interface PreviewPane {
  frame?: HTMLIFrameElement;
  bootstrapTimer?: number;
  ready: boolean;
  status: string;
  error: string;
  height?: number;
  code: string;
}

const categoryIcons: Record<CatalogCategory, string> = {
  views: mdiViewDashboardOutline,
  layouts: mdiViewGridOutline,
  widgets: mdiWidgetsOutline,
  inputs: mdiFormSelect,
  data: mdiTableFilter,
  dialogs: mdiMessageOutline,
};
const icon = (path: string) =>
  html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

@customElement("knx-component-gallery")
export class KnxComponentGallery extends LitElement {
  private _mobileMedia = matchMedia("(max-width: 700px)");
  @state() private _mobile = this._mobileMedia.matches;
  private _compactMedia = matchMedia("(max-width: 1100px)");
  @state() private _compact = this._compactMedia.matches;
  @state() private _inspectorCollapsed = false;
  @state() private _inspectorOpen = false;
  @state() private _settingsOpen = false;
  private _settingsAnchor?: Element;
  @state() private _projectLinksOpen = false;
  private _projectLinksAnchor?: Element;
  @query(".inspector") private _inspector?: HTMLElement;
  @query("#inspector-toggle") private _inspectorToggle?: HTMLElement;
  @query(".heading h2") private _componentHeading?: HTMLElement;
  @state() private _entryId = "";
  @state() private _scenarioId = "";
  @state() private _overrides: GalleryValues = {};
  @state() private _enabledSlots: string[] = [];
  @state() private _theme: GalleryTheme & { mode: "light" | "dark" } = {
    mode: "light",
    theme: "default",
  };
  @state() private _appDark = matchMedia("(prefers-color-scheme: dark)").matches;
  @state() private _compare = false;
  @state() private _viewMode: "preview" | "split" | "code" = "preview";
  @state() private _code = "";
  @state() private _copyStatus = "";
  @state() private _copyFailed = false;
  @state() private _bounds = false;
  @state() private _alignment = false;
  private _guides = new Map<HTMLIFrameElement, AlignmentGuides>();
  private _activeGuide?: AlignmentGuides;
  @state() private _zoomMode: "fit" | "manual" = "fit";
  @state() private _manualScale = 1;
  private _fitScale = 1;
  private _observedCanvas?: HTMLElement;
  private _navigation?: CanvasNavigation;
  private _observedBoard?: HTMLElement;
  private _stageSize: CanvasSize = { width: 0, height: 0 };
  private _boardSize: CanvasSize = { width: 0, height: 0 };
  @query(".canvas-board") private _board?: HTMLElement;
  private _boardObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const { target, contentRect: size } of entries) {
      if (![size.width, size.height].every((value) => Number.isFinite(value) && value > 0)) {
        continue;
      }
      const previous = target === this._observedCanvas ? this._stageSize : this._boardSize;
      if (previous.width === size.width && previous.height === size.height) continue;
      const next = { width: size.width, height: size.height };
      if (target === this._observedCanvas) this._stageSize = next;
      else this._boardSize = next;
      changed = true;
    }
    if (!changed) return;
    this._fitScale = fitScale(
      { width: this._stageSize.width - 48, height: this._stageSize.height - 48 },
      this._boardSize,
      this._fitScale,
    );
    this.requestUpdate();
    if (this._zoomMode === "fit") void this.updateComplete.then(() => this._centerCanvas());
  });
  @query(".canvas") private _canvas?: HTMLElement;
  @query(".preview-options-toggle") private _previewOptionsToggle?: HTMLElement;
  @state() private _width = 390;
  @state() private _selectedDevices: PreviewDevice[] = [devices[0]];
  private _panes = new Map<string, PreviewPane>();
  @state() private _autoHeight = false;
  @state() private _widthDraft = "390";
  @state() private _widthError = false;
  @state() private _catalogCollapsed = false;
  @state() private _search = "";
  @state() private _category: CatalogCategory | "all" = "all";
  @state() private _collapsedCategories = new Set<CatalogCategory>();
  @state() private _catalogOpen = false;
  @state() private _sessionId = "";
  @state() private _events: GalleryEvent[] = [];
  @queryAll("iframe") private _iframes!: NodeListOf<HTMLIFrameElement>;
  @queryAll(".device-presets ha-button") private _deviceButtons!: NodeListOf<HaButton>;
  @query(".catalog-toggle") private _catalogToggle?: HTMLButtonElement;
  @query("#catalog") private _catalog?: HTMLElement;
  @query(".catalog-search") private _catalogSearch?: HTMLElementTagNameMap["ha-input"];
  @query('.catalog-list a[aria-current="page"]') private _activeCatalogLink?: HTMLAnchorElement;
  private _viewportSizes = new Map<
    HTMLIFrameElement,
    { width: number; height: number } | undefined
  >();
  private _viewportObserver = new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) {
      const frame = target as HTMLIFrameElement;
      if (!this._viewportSizes.has(frame) || !contentRect.width || !contentRect.height) continue;
      const width = Math.round(contentRect.width);
      const height = Math.round(contentRect.height);
      const previous = this._viewportSizes.get(frame);
      if (previous?.width === width && previous.height === height) continue;
      this._viewportSizes.set(frame, { width, height });
      this.requestUpdate();
    }
  });
  private _previewState?: PreviewState;
  private _writer?: HTMLIFrameElement;
  private _revisions = new Map<HTMLIFrameElement, number>();
  private _previousCustomPanel?: PropertyDescriptor;
  // Route host actions by their originating realm, including unfocused previews.
  private _hostEvents = {
    dispatchEvent: (event: Event) => {
      for (const frame of this._iframes) {
        const view = frame.contentDocument?.defaultView;
        if (view && event instanceof view.Event) {
          return (
            frame.contentDocument?.querySelector("knx-gallery-preview")?.dispatchEvent(event) ??
            false
          );
        }
      }
      return false;
    },
  };
  private _customPanel = () =>
    [...this._panes.values()].some((pane) => pane.ready) ? this._hostEvents : undefined;

  public connectedCallback() {
    super.connectedCallback();
    this._previousCustomPanel = Object.getOwnPropertyDescriptor(window, "customPanel");
    Object.defineProperty(window, "customPanel", { configurable: true, get: this._customPanel });
    window.addEventListener("popstate", this._route);
    window.addEventListener("message", this._message);
    this._compactMedia.addEventListener("change", this._resize);
    this._mobileMedia.addEventListener("change", this._resize);
    this._route();
    this._applyTheme();
  }
  public disconnectedCallback() {
    super.disconnectedCallback();
    for (const pane of this._panes.values()) this._stopBootstrapTimer(pane);
    if (Object.getOwnPropertyDescriptor(window, "customPanel")?.get === this._customPanel) {
      if (this._previousCustomPanel) {
        Object.defineProperty(window, "customPanel", this._previousCustomPanel);
      } else {
        Reflect.deleteProperty(window, "customPanel");
      }
    }
    this._stopAlignment(false);
    this._viewportObserver.disconnect();
    this._boardObserver.disconnect();
    this._navigation?.dispose();
    this._navigation = undefined;
    this._observedBoard = undefined;
    this._observedCanvas = undefined;
    this._viewportSizes.clear();
    window.removeEventListener("popstate", this._route);
    window.removeEventListener("message", this._message);
    this._compactMedia.removeEventListener("change", this._resize);
    this._mobileMedia.removeEventListener("change", this._resize);
  }
  protected updated(changed: PropertyValues) {
    this._syncPanes();
    // HA forwards the label; pressed state also belongs on its public native button.
    for (const button of this._deviceButtons) {
      void button.updateComplete.then(() => {
        button.button?.setAttribute("aria-pressed", button.getAttribute("aria-pressed")!);
      });
    }
    this._syncGuides();
    if (this._canvas !== this._observedCanvas) {
      this._navigation?.dispose();
      this._navigation = this._canvas
        ? new CanvasNavigation(this._canvas, () => !this._alignment && this._viewMode !== "code")
        : undefined;
      if (this._observedCanvas) this._boardObserver.unobserve(this._observedCanvas);
      this._observedCanvas = this._canvas;
      if (this._observedCanvas) this._boardObserver.observe(this._observedCanvas);
    }
    if (this._board !== this._observedBoard) {
      if (this._observedBoard) this._boardObserver.unobserve(this._observedBoard);
      this._observedBoard = this._board;
      if (this._observedBoard) this._boardObserver.observe(this._observedBoard);
    }
    this._navigation?.syncFrames([...this._iframes]);
    const frames = new Set(this._iframes);
    for (const frame of this._viewportSizes.keys()) {
      if (!frames.has(frame)) {
        this._viewportObserver.unobserve(frame);
        this._viewportSizes.delete(frame);
      }
    }
    for (const frame of frames) {
      if (!this._viewportSizes.has(frame)) {
        this._viewportSizes.set(frame, undefined);
        this._viewportObserver.observe(frame);
      }
    }
    if (
      (changed.has("_entryId") ||
        changed.has("_catalogCollapsed") ||
        changed.has("_catalogOpen") ||
        changed.has("_mobile")) &&
      (this._mobile ? this._catalogOpen : !this._catalogCollapsed)
    ) {
      this._activeCatalogLink?.scrollIntoView({ block: "nearest" });
    }
  }
  private _applyTheme = () => {
    const theme: GalleryTheme = { mode: this._appDark ? "dark" : "light", theme: "default" };
    applyGalleryTheme(this, theme);
    applyGalleryTheme(document.documentElement, theme);
  };
  private _toggleAppMode() {
    this._appDark = !this._appDark;
    this._applyTheme();
  }
  private _resize = () => {
    if (this._compact) this._inspector?.hidePopover();
    this._compact = this._compactMedia.matches;
    if (this._mobile) this._catalog?.hidePopover();
    this._mobile = this._mobileMedia.matches;
    this._catalogOpen = false;
  };
  private _toggleInspector(ev: Event) {
    const button = ev.composedPath().find((target) => target instanceof HTMLButtonElement);
    if (button) button.popoverTargetElement = this._compact ? (this._inspector ?? null) : null;
    if (!this._compact) this._inspectorCollapsed = !this._inspectorCollapsed;
  }
  private _inspectorToggled(ev: ToggleEvent) {
    if (ev.target === ev.currentTarget) this._inspectorOpen = ev.newState === "open";
  }
  private _inspectorKeyDown(ev: KeyboardEvent) {
    if (this._compact && ev.key === "Escape" && !ev.defaultPrevented) {
      ev.preventDefault();
      this._closeInspector();
    }
  }
  private _closeInspector() {
    this._inspector?.hidePopover();
    this._inspectorToggle?.focus();
  }
  private _openSettings(ev: Event) {
    this._settingsAnchor = ev.currentTarget as Element;
    this._settingsOpen = true;
  }
  private _closeSettings(ev: Event) {
    if (ev.target === ev.currentTarget) this._settingsOpen = false;
  }
  private _openProjectLinks(ev: Event) {
    this._projectLinksAnchor = ev.currentTarget as Element;
    this._projectLinksOpen = true;
  }
  private _closeProjectLinks(ev: Event) {
    if (ev.target === ev.currentTarget) this._projectLinksOpen = false;
  }
  private _projectLinksKeyDown(ev: KeyboardEvent) {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    this._projectLinksOpen = false;
  }
  private _route = () => {
    const params = new URLSearchParams(location.search);
    const previousEntry = this._entryId;
    this._entryId = params.get("component") ?? "";
    const entry = catalog.find((item) => item.meta.id === this._entryId);
    if (previousEntry !== this._entryId) {
      if (this._compact) this._inspector?.hidePopover();
      if (entry) {
        const category = catalogGroups.find(({ entries }) =>
          entries.some((item) => item.meta.id === entry.meta.id),
        )!.id;
        if (this._category !== "all" && this._category !== category) this._category = "all";
        if (
          !`${entry.meta.title} ${entry.meta.tag} ${entry.covers.join(" ")}`
            .toLocaleLowerCase()
            .includes(this._search.toLocaleLowerCase().trim())
        ) {
          this._search = "";
        }
        if (this._collapsedCategories.has(category)) {
          const collapsed = new Set(this._collapsedCategories);
          collapsed.delete(category);
          this._collapsedCategories = collapsed;
        }
      }
    }
    this._scenarioId = params.get("scenario") ?? entry?.meta.scenarios[0]?.id ?? "";
    this._reset();
  };
  private _navigate(entryId = "", scenarioId = "") {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    if (entryId) {
      url.searchParams.set("component", entryId);
      url.searchParams.set("scenario", scenarioId);
    }
    history.pushState(null, "", url);
    this._route();
  }
  private _reset() {
    this._navigation?.cancel();
    this._stopAlignment(false);
    this._previewState = undefined;
    this._code = "";
    for (const pane of this._panes.values()) this._stopBootstrapTimer(pane);
    this._panes.clear();
    this._sessionId = crypto.randomUUID();
    this._writer = undefined;
    this._revisions.clear();
    this._overrides = {};
    // Sticky panels require their heading slot; replacement headers remain opt-in.
    this._enabledSlots =
      catalog
        .find((item) => item.meta.id === this._entryId)
        ?.meta.slots.filter(
          (slot) => slot.name !== "header" || this._entryId === "knx-sticky-expansion-panel",
        )
        .map((slot) => slot.name) ?? [];
    this._events = [];
  }
  private _paneKey(deviceId: PreviewDevice["id"], comparison: boolean): string {
    return `${deviceId}:${comparison ? "comparison" : "primary"}`;
  }
  private _pane(key: string): PreviewPane {
    let pane = this._panes.get(key);
    if (!pane) {
      pane = { ready: false, status: en.ui.loading, error: "", code: "" };
      this._panes.set(key, pane);
    }
    return pane;
  }
  private _syncPanes() {
    const frames = new Set(this._iframes);
    for (const [key, pane] of this._panes) {
      if (pane.frame && !frames.has(pane.frame)) {
        this._stopBootstrapTimer(pane);
        this._revisions.delete(pane.frame);
        if (this._writer === pane.frame) this._writer = undefined;
        this._panes.delete(key);
      }
    }
    for (const frame of frames) {
      const key = frame.dataset.previewKey!;
      const pane = this._pane(key);
      if (pane.frame === frame) continue;
      pane.frame = frame;
      if (pane.ready) continue;
      const session = this._sessionId;
      pane.bootstrapTimer = window.setTimeout(() => {
        delete pane.bootstrapTimer;
        if (
          !this.isConnected ||
          this._sessionId !== session ||
          this._panes.get(key) !== pane ||
          pane.frame !== frame ||
          pane.ready
        ) {
          return;
        }
        pane.error = en.failed;
        pane.status = en.ui.failed;
        this._events = appendEvent(this._events, {
          kind: "error",
          name: frame.title,
          timestamp: Date.now(),
          args: pane.error,
        });
        this.requestUpdate();
      }, 30_000);
    }
    this._code = this._panes.get(this._paneKey(this._selectedDevices[0].id, false))?.code ?? "";
    if (!this._writer) this._assignWriter();
  }
  private _stopBootstrapTimer(pane: PreviewPane) {
    window.clearTimeout(pane.bootstrapTimer);
    delete pane.bootstrapTimer;
  }
  private _assignWriter() {
    if (!this._writer) {
      const next = Array.from(this._iframes).find(
        (frame) => this._panes.get(frame.dataset.previewKey!)?.status === en.ui.ready,
      );
      if (!next) return;
      this._writer = next;
      this._revisions.set(next, this._revisions.get(next) ?? 0);
      // A replacement producer starts from the latest accepted model before ticking.
      if (this._previewState) {
        next.contentWindow?.postMessage(
          {
            channel: "knx-gallery",
            sessionId: this._sessionId,
            type: "preview-state",
            state: this._previewState,
            interaction: false,
            revision: this._revisions.get(next) ?? 0,
          },
          location.origin,
        );
      }
    }
    for (const peer of this._iframes) {
      peer.contentWindow?.postMessage(
        {
          channel: "knx-gallery",
          sessionId: this._sessionId,
          type: "writer",
          active: peer === this._writer,
          revision: this._revisions.get(peer) ?? 0,
        },
        location.origin,
      );
    }
  }
  private _configure(only?: HTMLIFrameElement) {
    for (const frame of this._iframes) {
      const pane = this._panes.get(frame.dataset.previewKey!);
      if ((only && only !== frame) || !pane?.ready) continue;
      pane.status = en.ui.loading;
      const comparison = frame.dataset.pane === "comparison";
      const message: GalleryConfigureMessage = {
        channel: "knx-gallery",
        type: "configure",
        autoHeight: this._autoHeight,
        sessionId: this._sessionId,
        componentId: this._entryId,
        ...(this._previewState?.fixtures ? { fixtures: this._previewState.fixtures } : {}),
        scenarioId: this._scenarioId,
        overrides: this._overrides,
        slots: this._enabledSlots,
        theme: {
          ...this._theme,
          mode: this._compare ? (comparison ? "dark" : "light") : this._theme.mode,
        },
      };
      frame.contentWindow?.postMessage(message, location.origin);
    }
    this.requestUpdate();
  }
  private _message = (ev: MessageEvent) => {
    const frame = Array.from(this._iframes).find((item) => item.contentWindow === ev.source);
    if (!frame?.contentWindow) return;
    const comparison = frame.dataset.pane === "comparison";
    const device = this._selectedDevices.find((item) => item.id === frame.dataset.device);
    if (!device || (comparison && !this._compare)) return;
    const pane = this._panes.get(frame.dataset.previewKey!);
    if (!pane || (pane.frame && pane.frame !== frame)) return;
    const message = readMessage(ev, frame.contentWindow, location.origin, this._sessionId);
    if (!message) return;
    pane.frame = frame;
    const primary = !comparison && device.id === this._selectedDevices[0].id;
    const label =
      this._selectedDevices.length > 1
        ? `${device.id === "custom" ? en.ui.custom : en.ui.devices[device.id]} · ${en.ui[this._compare ? (comparison ? "dark" : "light") : this._theme.mode]}`
        : this._compare
          ? en.ui[comparison ? "dark" : "light"]
          : "";
    if (message.type === "code") {
      pane.code = message.code;
      if (primary) this._code = message.code;
    } else if (message.type === "interaction-start") {
      this._writer = frame;
      this._revisions.set(frame, message.revision);
      this._assignWriter();
    } else if (message.type === "fixture-telegrams") {
      if (message.revision !== (this._revisions.get(frame) ?? 0)) return;
      if (this._previewState) {
        this._previewState = mergeFixtureTelegrams(this._previewState, message.telegrams);
      }
      for (const peer of this._iframes) {
        if (peer !== frame) {
          peer.contentWindow?.postMessage(
            { ...message, revision: this._revisions.get(peer) ?? 0 },
            location.origin,
          );
        }
      }
    } else if (message.type === "preview-state") {
      // Each pane initializes its own defaults. Only user-owned state is replayed:
      // an initial snapshot may precede asynchronous descendant initialization.
      if (
        message.interaction &&
        this._writer === frame &&
        message.revision === this._revisions.get(frame)
      ) {
        this._previewState = isTelegramHistory(this._previewState?.fixtures?.telegrams)
          ? mergeFixtureTelegrams(message.state, this._previewState.fixtures.telegrams)
          : message.state;
        for (const peer of this._iframes) {
          if (peer !== frame) {
            peer.contentWindow?.postMessage(
              {
                ...message,
                state: this._previewState,
                interaction: false,
                revision: this._revisions.get(peer) ?? 0,
              },
              location.origin,
            );
          }
        }
      }
    } else if (message.type === "resize") {
      pane.height = message.height ?? undefined;
    } else if (message.type === "ready") {
      this._stopBootstrapTimer(pane);
      pane.ready = true;
      pane.error = "";
      this._configure(frame);
    } else if (message.type === "rendered" || message.type === "error") {
      this._stopBootstrapTimer(pane);
      pane.error = message.type === "error" ? message.error || en.failed : "";
      pane.status = pane.error ? en.ui.failed : en.ui.ready;
      this._applyBounds();
      if (!pane.error && this._previewState) {
        frame.contentWindow?.postMessage(
          {
            channel: "knx-gallery",
            sessionId: this._sessionId,
            type: "preview-state",
            state: this._previewState,
            interaction: false,
            revision: this._revisions.get(frame) ?? 0,
          },
          location.origin,
        );
      }
      if (!pane.error) this._assignWriter();
      if (pane.error) {
        this._events = appendEvent(this._events, {
          kind: "error",
          name: label || en.preview,
          timestamp: Date.now(),
          args: pane.error,
        });
      }
    } else if (message.type === "event") {
      this._events = appendEvent(
        this._events,
        label ? { ...message.event, name: `${label} · ${message.event.name}` } : message.event,
      );
    }
    this.requestUpdate();
  };
  private _setPreviewMode(ev: Event) {
    const mode = (
      ev.type === "wa-select"
        ? (ev as HaDropdownSelectEvent).detail.item.value
        : (ev.currentTarget as HTMLElement).dataset.mode
    ) as "light" | "dark" | "compare";
    if (mode === (this._compare ? "compare" : this._theme.mode)) return;
    this._compare = mode === "compare";
    if (mode !== "compare") this._theme = { ...this._theme, mode };
    // Appearance must not reapply scenario defaults over interactive state.
    for (const frame of this._iframes) {
      if (frame.dataset.pane === "comparison") continue;
      frame.contentWindow?.postMessage(
        {
          channel: "knx-gallery",
          sessionId: this._sessionId,
          type: "appearance",
          theme: { ...this._theme, mode: this._compare ? "light" : this._theme.mode },
        },
        location.origin,
      );
    }
  }
  private _applyBounds() {
    for (const frame of this._iframes) {
      frame.contentDocument
        ?.querySelector("knx-gallery-preview")
        ?.toggleAttribute("show-bounds", this._bounds);
    }
  }
  private _toggleBounds() {
    this._bounds = !this._bounds;
    this._applyBounds();
  }
  private _toggleAutoHeight() {
    this._autoHeight = !this._autoHeight;
    for (const frame of this._iframes) {
      frame.contentWindow?.postMessage(
        {
          channel: "knx-gallery",
          sessionId: this._sessionId,
          type: "auto-height",
          enabled: this._autoHeight,
        },
        location.origin,
      );
    }
  }
  private _syncGuides() {
    for (const [frame, guides] of this._guides) {
      if (!this._alignment || !frame.isConnected || frame.contentDocument !== guides.document) {
        guides.dispose();
        this._guides.delete(frame);
        this.requestUpdate();
        if (this._activeGuide === guides) this._activeGuide = undefined;
      }
    }
    if (!this._alignment) return;
    for (const frame of this._iframes) {
      if (this._guides.has(frame) || !frame.contentDocument?.querySelector("knx-gallery-preview")) {
        continue;
      }
      this._guides.set(
        frame,
        new AlignmentGuides(
          frame.contentDocument,
          (guides) => {
            this._activeGuide = guides;
            this.requestUpdate();
          },
          () => this._stopAlignment(),
          () => frame.getBoundingClientRect().width / frame.clientWidth || 1,
        ),
      );
    }
  }
  private _toggleAlignment() {
    if (this._alignment) this._stopAlignment(false);
    else this._startAlignment();
  }
  private _startAlignment() {
    this._navigation?.cancel();
    this._settingsOpen = false;
    if (this._viewMode === "code") this._viewMode = "preview";
    this._alignment = true;
    this._syncGuides();
    window.addEventListener("keydown", this._alignmentKeyDown, true);
  }
  private _stopAlignment(focus = true) {
    const active = this._alignment;
    this._alignment = false;
    for (const guides of this._guides.values()) guides.dispose();
    this._guides.clear();
    this._activeGuide = undefined;
    window.removeEventListener("keydown", this._alignmentKeyDown, true);
    if (active && focus) {
      this._previewOptionsToggle?.focus();
    }
  }
  private _alignmentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this._stopAlignment();
  };
  private _exitAlignment() {
    this._stopAlignment();
  }
  private _resetGuides() {
    for (const guides of this._guides.values()) guides.reset();
  }
  private _selectGuideElement(event: HaDropdownSelectEvent) {
    this._activeGuide?.select(Number(event.detail.item.value));
  }
  private _renderAlignment() {
    if (!this._alignment) return nothing;
    const count = [...this._guides.values()].reduce(
      (total, guides) => total + guides.pinned.size,
      0,
    );
    const guide = this._activeGuide;
    return html`<section class="alignment-bar" aria-label=${en.ui.alignment}>
      <strong>${en.ui.alignment}</strong>
      <span class="alignment-count" aria-live="polite"
        >${en.ui.pinnedGuides.replace("{count}", String(count))}</span
      >
      <ha-dropdown placement="top" @wa-select=${this._selectGuideElement}>
        <ha-button
          slot="trigger"
          size="s"
          appearance="plain"
          variant="neutral"
          .disabled=${!guide?.chain.length}
          .ariaLabel=${en.ui.chooseElement}
        >
          ${en.ui.chooseElement}<ha-svg-icon slot="end" .path=${mdiChevronDown}></ha-svg-icon>
        </ha-button>
        ${guide?.chain.map((element, index) => html`<ha-dropdown-item .value=${String(index)} .selected=${guide.pinned.has(element)}>${AlignmentGuides.label(element)}</ha-dropdown-item>`)}
      </ha-dropdown>
      <ha-icon-button
        .label=${en.ui.resetGuides}
        .path=${mdiUndoVariant}
        @click=${this._resetGuides}
      ></ha-icon-button>
      <ha-button size="s" @click=${this._exitAlignment}
        >${en.ui.exitInspection}<ha-svg-icon slot="end" .path=${mdiClose}></ha-svg-icon
      ></ha-button>
    </section>`;
  }
  private get _scale() {
    return this._zoomMode === "fit" ? this._fitScale : this._manualScale;
  }
  private _centerCanvas() {
    const surface = this._canvas;
    if (!surface) return;
    surface.scrollLeft = (surface.scrollWidth - surface.clientWidth) / 2;
    surface.scrollTop = (surface.scrollHeight - surface.clientHeight) / 2;
  }
  private _fitCanvas() {
    this._zoomMode = "fit";
    void this.updateComplete.then(() => this._centerCanvas());
  }
  private _actualCanvas() {
    this._zoomMode = "manual";
    this._manualScale = 1;
    void this.updateComplete.then(() => this._centerCanvas());
  }
  private async _stepCanvasZoom(direction: -1 | 1) {
    const surface = this._canvas;
    const board = this._board;
    if (!surface || !board) return;
    const x = (surface.scrollLeft + surface.clientWidth / 2 - board.offsetLeft) / this._scale;
    const y = (surface.scrollTop + surface.clientHeight / 2 - board.offsetTop) / this._scale;
    this._manualScale = stepScale(this._scale, direction);
    this._zoomMode = "manual";
    await this.updateComplete;
    surface.scrollLeft = board.offsetLeft + x * this._scale - surface.clientWidth / 2;
    surface.scrollTop = board.offsetTop + y * this._scale - surface.clientHeight / 2;
  }
  private _zoomIn() {
    void this._stepCanvasZoom(1);
  }
  private _zoomOut() {
    void this._stepCanvasZoom(-1);
  }
  private _renderCanvasNavigation(): TemplateResult {
    return html`<section
      class="canvas-navigation"
      aria-label=${en.ui.canvasNavigation}
      ?hidden=${this._viewMode === "code"}
    >
      <ha-icon-button
        .label=${en.ui.zoomOut}
        .path=${mdiMinus}
        .disabled=${this._zoomMode === "manual" && this._scale <= 0.1}
        @click=${this._zoomOut}
      ></ha-icon-button>
      <span class="zoom-value" aria-live="polite">${Math.round(this._scale * 100)}%</span>
      <ha-icon-button
        .label=${en.ui.zoomIn}
        .path=${mdiPlus}
        .disabled=${this._scale >= 2}
        @click=${this._zoomIn}
      ></ha-icon-button>
      <ha-button
        size="s"
        .appearance=${this._zoomMode === "fit" ? "accent" : "plain"}
        @click=${this._fitCanvas}
        >${en.ui.zoomFit}</ha-button
      >
      <ha-button size="s" appearance="plain" @click=${this._actualCanvas}>100%</ha-button>
    </section>`;
  }
  private _renderPreview(device: PreviewDevice, comparison: boolean): TemplateResult {
    const mode = this._compare ? (comparison ? "dark" : "light") : this._theme.mode;
    const preset = devices.find((item) => item.id === device.id);
    const key = this._paneKey(device.id, comparison);
    const pane = this._pane(key);
    const size = pane.frame ? this._viewportSizes.get(pane.frame) : undefined;
    const { status, error } = pane;
    const height = this._autoHeight ? pane.height : undefined;
    return html`<section
      class="preview-card"
      data-preview-key=${key}
      style=${`--preview-width: ${device.width}px;`}
      aria-label=${en.ui[mode]}
    >
      <div class="preview-caption">
        <div class="preview-identity">
          <ha-svg-icon .path=${modeIcons[mode]}></ha-svg-icon>
          <strong>${en.ui[mode]}</strong>
        </div>
        <span class="preview-dimensions"
          >${size?.width ?? device.width} × ${size?.height ?? "—"} px</span
        >
        <div class="preview-meta">
          <span class="preview-context">
            <span>${preset ? en.ui.devices[preset.id] : en.ui.custom}</span>
            <span aria-hidden="true">·</span>
            <span role="status" class=${error ? "error" : ""} title=${status}>${status}</span>
          </span>
          <span class="preview-scale" title=${en.ui.zoom}>${Math.round(this._scale * 100)}%</span>
        </div>
      </div>
      ${error ? html`<p class="error" role="alert">${error}</p>` : nothing}
      <div class="preview-scroll">
        <div
          class="preview-viewport"
          style=${`--viewport-height: ${Math.max(1, height ?? Math.max(240, this._stageSize.height - 116))}px;`}
        >
          ${keyed(
            this._sessionId,
            html`<iframe
              data-pane=${comparison ? "comparison" : "primary"}
              data-device=${device.id}
              data-preview-key=${key}
              title=${`${en.preview} · ${en.ui[mode]}`}
              src=${galleryUrl(`preview.html?session=${encodeURIComponent(this._sessionId)}${comparison ? "&pane=comparison" : ""}`)}
              style=${`width: ${device.width}px;`}
              referrerpolicy="no-referrer"
            ></iframe>`,
          )}
        </div>
      </div>
    </section>`;
  }
  private _setViewMode(ev: Event) {
    this._navigation?.cancel();
    this._viewMode = (
      ev.type === "wa-select"
        ? (ev as HaDropdownSelectEvent).detail.item.value
        : (ev.currentTarget as HTMLElement).dataset.view
    ) as typeof this._viewMode;
    if (this._viewMode === "code") this._stopAlignment(false);
    this._copyStatus = "";
  }
  private async _copyCode() {
    this._copyStatus = "";
    await this.updateComplete;
    try {
      await navigator.clipboard.writeText(this._code);
      this._copyFailed = false;
      this._copyStatus = en.ui.codeCopied;
    } catch {
      this._copyFailed = true;
      this._copyStatus = en.ui.codeCopyFailed;
    }
  }
  private _renderCode() {
    return html`<section
      class="code-panel"
      ?hidden=${this._viewMode === "preview"}
      aria-label=${en.ui.usageCode}
    >
      <div class="code-heading">
        <strong>${en.ui.usageCode}</strong>
        <ha-button
          size="s"
          appearance="plain"
          variant="neutral"
          .disabled=${!this._code}
          @click=${this._copyCode}
          >${en.ui.copyCode}</ha-button
        >
      </div>
      <p class="code-help">${en.ui.codeHelp}</p>
      <span
        class=${this._copyFailed ? "copy-status error" : "copy-status"}
        role="status"
        aria-live="polite"
        >${this._copyStatus}</span
      >
      <pre
        tabindex="0"
        aria-label=${en.ui.usageCode}
      ><code>${guard([this._code], () => (this._code ? highlightCode(this._code) : en.ui.codeLoading))}</code></pre>
    </section>`;
  }
  private _renderWidthInput(id: string) {
    return html`<ha-input
      id=${id}
      appearance="outlined"
      type="number"
      min="1"
      .step=${"any"}
      .value=${this._widthDraft}
      .label=${id === "preview-width" ? "" : en.ui.width}
      .invalid=${this._widthError}
      .validationMessage=${en.ui.widthError}
      @input=${this._widthDraftChanged}
      @change=${this._setWidth}
      ><span slot="label" class=${id === "preview-width" ? "sr-only" : ""}>${en.ui.width}</span
      ><span slot="end">px</span></ha-input
    >`;
  }
  private _widthDraftChanged(ev: Event) {
    this._widthDraft = (ev.currentTarget as HTMLElementTagNameMap["ha-input"]).value ?? "";
  }
  private _setWidth(ev: Event) {
    this._widthDraft = (ev.currentTarget as HTMLElementTagNameMap["ha-input"]).value ?? "";
    const width = Number(this._widthDraft);
    this._widthError = !Number.isFinite(width) || width <= 0;
    if (!this._widthError) {
      this._width = width;
      this._selectedDevices = [{ id: "custom", width }];
    }
  }
  private _setTheme(ev: HaSelectSelectEvent<GalleryTheme["theme"]>) {
    this._theme = { ...this._theme, theme: ev.detail.value };
    for (const frame of this._iframes) {
      frame.contentWindow?.postMessage(
        {
          channel: "knx-gallery",
          sessionId: this._sessionId,
          type: "appearance",
          theme: {
            ...this._theme,
            mode: this._compare
              ? frame.dataset.pane === "comparison"
                ? "dark"
                : "light"
              : this._theme.mode,
          },
        },
        location.origin,
      );
    }
  }
  private _searchChanged(ev: Event) {
    this._search = (ev.currentTarget as HTMLElementTagNameMap["ha-input"]).value ?? "";
  }
  private _linkClicked(ev: MouseEvent) {
    if (ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    const returnToMenu = this._mobile && this._catalogOpen;
    if (returnToMenu) {
      this._catalog?.hidePopover();
    }
    const link = ev.currentTarget as HTMLAnchorElement;
    const url = new URL(link.href);
    this._navigate(url.searchParams.get("component") ?? "", url.searchParams.get("scenario") ?? "");
    if (link.closest(".component-relationships, .overview")) {
      void this.updateComplete.then(() => this._componentHeading?.focus());
    } else if (returnToMenu) {
      void this.updateComplete.then(() => this._catalogToggle?.focus());
    }
  }
  private _renderRelationships() {
    const related = componentRelationships.filter(
      ({ from, to }) => from === this._entryId || to === this._entryId,
    );
    if (!related.length) return nothing;
    return html`<section
      slot="relationships"
      class="component-relationships"
      aria-label=${en.ui.relationships}
    >
      <h3>${en.ui.relationships}</h3>
      ${(["internal", "slot"] as const).flatMap((kind) =>
        [false, true].map((reverse) => {
          const links = related.filter(
            (relation) =>
              relation.kind === kind && (reverse ? relation.to : relation.from) === this._entryId,
          );
          if (!links.length) return nothing;
          return html`<h4>
              ${kind === "internal" ? (reverse ? en.ui.usedBy : en.ui.usedInternally) : reverse ? en.ui.canBePlacedIn : en.ui.canUseInSlot}
            </h4>
            <ul>
              ${links.map((relation) => {
                const target = catalog.find(
                  ({ meta }) => meta.id === (reverse ? relation.from : relation.to),
                )!;
                return html`<li>
                  <a
                    href=${`?component=${encodeURIComponent(target.meta.id)}&scenario=${encodeURIComponent(target.meta.scenarios[0].id)}`}
                    @click=${this._linkClicked}
                    >${target.meta.tag}</a
                  >
                  <p>${en.ui.relationshipRoles[relation.role]}</p>
                </li>`;
              })}
            </ul>`;
        }),
      )}
    </section>`;
  }
  private _categoryChanged(ev: HaDropdownSelectEvent<CatalogCategory | "all">) {
    this._category = ev.detail.item.value;
  }
  private _jumpToCategory(ev: Event) {
    const category = (ev.currentTarget as HTMLButtonElement).dataset.category;
    // eslint-disable-next-line lit/prefer-query-decorators -- The clicked category determines the target.
    const heading = this.renderRoot.querySelector<HTMLElement>(`#overview-${category}`);
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }
  private _renderOverviewRelationship(entryId: string) {
    const related = componentRelationships.filter(({ to }) => to === entryId);
    if (!related.length) return nothing;
    const internal = related.filter(({ kind }) => kind === "internal");
    const parents = (internal.length ? internal : related)
      .map(({ from }) => catalog.find(({ meta }) => meta.id === from)!.meta.title)
      .join(", ");
    const label = `${internal.length ? en.ui.usedBy : en.ui.canBePlacedIn} ${parents}`;
    return html`<span class="overview-relationship" .title=${label}>${label}</span>`;
  }
  private _toggleCategory(ev: Event) {
    const category = (ev.currentTarget as HTMLButtonElement).dataset.category as CatalogCategory;
    const collapsed = new Set(this._collapsedCategories);
    if (collapsed.has(category)) collapsed.delete(category);
    else collapsed.add(category);
    this._collapsedCategories = collapsed;
  }
  private async _toggleCatalog() {
    // Mobile uses the button's native popovertarget behavior.
    if (this._mobile) return;
    this._catalogCollapsed = !this._catalogCollapsed;
    await this.updateComplete;
    if (!this._catalogCollapsed) this._catalogSearch?.focus();
  }
  private _catalogToggled(ev: ToggleEvent) {
    if (ev.target !== ev.currentTarget) return;
    this._catalogOpen = ev.newState === "open";
    if (this._catalogOpen) this._catalogSearch?.focus();
  }
  private _catalogKeyDown(ev: KeyboardEvent) {
    if (this._mobile && ev.key === "Escape" && !ev.defaultPrevented) {
      ev.preventDefault();
      this._catalog?.hidePopover();
      this._catalogToggle?.focus();
    }
  }
  private _renderCatalogToggle() {
    const open = this._mobile ? this._catalogOpen : !this._catalogCollapsed;
    return html`<button
      class="catalog-toggle"
      aria-label=${open ? en.ui.closeCatalog : en.ui.openCatalog}
      title=${open ? en.ui.closeCatalog : en.ui.openCatalog}
      aria-expanded=${open ? "true" : "false"}
      aria-controls="catalog"
      popovertarget=${ifDefined(this._mobile ? "catalog" : undefined)}
      @click=${this._toggleCatalog}
    >
      ${icon(mdiMenu)}
    </button>`;
  }
  private _back() {
    this._navigate();
  }
  private _scenarioTabChanged(ev: CustomEvent<{ name: string }>) {
    if (ev.detail.name !== this._scenarioId) this._navigate(this._entryId, ev.detail.name);
  }
  private _scenarioChanged(ev: HaSelectSelectEvent<string>) {
    this._navigate(this._entryId, ev.detail.value);
  }
  private _selectDevice(width: number, toggle: boolean) {
    const device = devices.find((item) => item.width === width);
    if (!device) return;
    const selected = this._selectedDevices.filter((item) => item.id !== "custom");
    const removing = selected.some((item) => item.id === device.id);
    if (toggle && removing && selected.length === 1) return;
    this._selectedDevices = toggle
      ? devices.filter((item) =>
          item.id === device.id ? !removing : selected.some((value) => value.id === item.id),
        )
      : [device];
    this._width = this._selectedDevices[0].width;
    this._widthDraft = String(this._width);
    this._widthError = false;
  }
  private _presetWidth(ev: Event) {
    if (ev.type === "wa-select") {
      const event = ev as HaDropdownSelectEvent;
      event.preventDefault();
      this._selectDevice(Number(event.detail.item.value), true);
      event.detail.item.checked = this._selectedDevices.some(
        (item) => item.width === Number(event.detail.item.value) && item.id !== "custom",
      );
    } else {
      const event = ev as MouseEvent;
      this._selectDevice(
        Number((event.currentTarget as HTMLElement).dataset.width),
        event.metaKey || event.ctrlKey,
      );
    }
  }
  private _overridesChanged(ev: CustomEvent<GalleryValues>) {
    this._previewState = undefined;
    this._overrides = ev.detail;
    this._configure();
  }
  private _slotsChanged(ev: CustomEvent<string[]>) {
    this._previewState = undefined;
    this._enabledSlots = ev.detail;
    this._configure();
  }
  private _clearLog() {
    this._events = [];
  }
  protected render() {
    const entry = catalog.find((item) => item.meta.id === this._entryId);
    const selectedDevice = devices.find((device) => device.id === this._selectedDevices[0].id);
    const deviceSummary = this._selectedDevices
      .map((device) =>
        device.id === "custom" ? `${en.ui.custom} · ${device.width} px` : en.ui.devices[device.id],
      )
      .join(", ");
    const previews = (this._compare ? [false, true] : [false]).flatMap((comparison) =>
      this._selectedDevices.map((device) => ({
        device,
        comparison,
        key: this._paneKey(device.id, comparison),
      })),
    );
    const columns =
      this._compare && this._selectedDevices.length === 1
        ? [this._selectedDevices[0], this._selectedDevices[0]]
        : this._selectedDevices;
    const previewMode = this._compare ? "compare" : this._theme.mode;
    const inspectorVisible = this._compact ? this._inspectorOpen : !this._inspectorCollapsed;
    const valid = entry?.meta.scenarios.some((scenario) => scenario.id === this._scenarioId);
    const search = this._search.toLocaleLowerCase().trim();
    const groups = catalogGroups
      .filter(({ id }) => this._category === "all" || this._category === id)
      .map(({ id, entries }) => ({
        id,
        entries: entries
          .filter(({ meta, covers }) =>
            `${meta.title} ${meta.tag} ${covers.join(" ")}`.toLocaleLowerCase().includes(search),
          )
          .sort((a, b) => a.meta.title.localeCompare(b.meta.title, "en")),
      }))
      .filter(({ entries }) => entries.length);
    const canCollapse = this._category === "all" && !search;
    const scenarioTabs = entry
      ? keyed(
          entry.meta.id,
          html`<ha-tab-group
            id="scenario-tabs"
            .active=${this._scenarioId}
            @wa-tab-show=${this._scenarioTabChanged}
          >
            ${entry.meta.scenarios.map(
              (scenario) =>
                html`<ha-tab-group-tab
                  slot="nav"
                  .panel=${scenario.id}
                  .active=${scenario.id === this._scenarioId}
                  aria-controls="scenario-workspace"
                  .title=${scenario.label}
                  >${scenario.shortLabel ?? scenario.label}</ha-tab-group-tab
                >`,
            )}
          </ha-tab-group>`,
        )
      : nothing;
    return html`<div
      class="layout ${this._mobile || this._catalogCollapsed ? "catalog-collapsed" : ""}"
    >
      <nav
        id="catalog"
        aria-label=${en.ui.catalog}
        popover=${ifDefined(this._mobile ? "auto" : undefined)}
        @toggle=${this._catalogToggled}
        @keydown=${this._catalogKeyDown}
        ?hidden=${!this._mobile && this._catalogCollapsed}
      >
        <div class="catalog-body">
          <div class="catalog-tools">
            <div class="brand">
              <h1>${en.title}</h1>
              <p>${en.subtitle}</p>
            </div>
            <ha-input
              class="catalog-search"
              appearance="outlined"
              .type=${"search"}
              .placeholder=${en.ui.search}
              .withClear=${true}
              .value=${this._search}
              @input=${this._searchChanged}
            >
              <span slot="label" class="sr-only">${en.ui.search}</span>
              <ha-svg-icon slot="start" .path=${mdiMagnify}></ha-svg-icon>
            </ha-input>
            <div class="catalog-filter-row">
              <ha-dropdown placement="bottom-start" @wa-select=${this._categoryChanged}>
                <ha-button
                  slot="trigger"
                  size="s"
                  appearance="plain"
                  variant="neutral"
                  .ariaLabel=${`${en.ui.categories}: ${this._category === "all" ? en.ui.allComponents : en.ui.categoryLabels[this._category]}`}
                  >${this._category === "all" ? en.ui.allComponents : en.ui.categoryLabels[this._category]}
                  <ha-svg-icon slot="end" .path=${mdiChevronDown}></ha-svg-icon>
                </ha-button>
                ${(["all", ...catalogGroups.map(({ id }) => id)] as const).map(
                  (id) =>
                    html` <ha-dropdown-item .value=${id} .selected=${this._category === id}>
                      ${id === "all" ? en.ui.allComponents : en.ui.categoryLabels[id]}
                    </ha-dropdown-item>`,
                )}
              </ha-dropdown>
              <span class="catalog-count" aria-live="polite" aria-atomic="true"
                >${groups.reduce((total, group) => total + group.entries.length, 0)} /
                ${catalog.length}</span
              >
            </div>
          </div>
          <a
            class="overview-link"
            href="?"
            aria-current=${!this._entryId ? "page" : "false"}
            @click=${this._linkClicked}
          >
            ${icon(mdiViewGridOutline)}${en.ui.overview}
          </a>
          <div class="catalog-list">
            ${groups.map(({ id, entries }) => {
              const expanded = !canCollapse || !this._collapsedCategories.has(id);
              const heading = html`${icon(categoryIcons[id])}<span>${en.ui.categoryTitles[id]}</span
                ><span class="catalog-count">${entries.length}</span>`;
              return html`<section class="catalog-group">
                ${
                  canCollapse
                    ? html`<h3>
                        <button
                          class="category-heading"
                          data-category=${id}
                          aria-expanded=${expanded ? "true" : "false"}
                          aria-controls=${`catalog-${id}`}
                          @click=${this._toggleCategory}
                        >
                          ${heading}${icon(mdiChevronDown)}
                        </button>
                      </h3>`
                    : html`<h3 class="category-heading">${heading}</h3>`
                }
                <ul id=${`catalog-${id}`} ?hidden=${!expanded}>
                  ${entries.map(
                    ({ meta }) =>
                      html`<li>
                        <a
                          href=${`?component=${encodeURIComponent(meta.id)}&scenario=${encodeURIComponent(meta.scenarios[0].id)}`}
                          aria-label=${`${meta.title} ${meta.tag}`}
                          .title=${meta.tag}
                          aria-current=${meta.id === this._entryId ? "page" : "false"}
                          @click=${this._linkClicked}
                        >
                          <span class="catalog-title">${meta.title}</span>
                          <span class="catalog-tag">${meta.tag}</span>
                        </a>
                      </li>`,
                  )}
                </ul>
              </section>`;
            })}
            ${!groups.length ? html`<p class="catalog-empty">${en.ui.noMatches}</p>` : nothing}
          </div>
          <div class="catalog-footer" role="group" aria-label=${en.ui.galleryTools}>
            <ha-button
              size="s"
              variant="neutral"
              appearance="plain"
              @click=${this._openProjectLinks}
              ><ha-svg-icon slot="start" .path=${mdiLinkVariant}></ha-svg-icon
              >${en.ui.projectLinks}</ha-button
            >
            <ha-adaptive-popover
              class="project-links-popover"
              width="small"
              .open=${this._projectLinksOpen}
              .dialogAnchor=${this._projectLinksAnchor}
              .headerTitle=${en.ui.projectLinks}
              @closed=${this._closeProjectLinks}
              @keydown=${this._projectLinksKeyDown}
            >
              <div class="project-links">
                ${[
                  [en.ui.projectFrontend, "https://github.com/XKNX/knx-frontend"],
                  [en.ui.projectOrganisation, "https://github.com/XKNX"],
                  [en.ui.projectDocumentation, "https://www.home-assistant.io/integrations/knx/"],
                  [en.ui.projectIntegration, "https://github.com/XKNX/knx-integration"],
                ].map(
                  ([label, href]) =>
                    html`<a
                      href=${href}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-popover="close"
                      ><span>${label}</span
                      ><ha-svg-icon .path=${mdiOpenInNew} aria-hidden="true"></ha-svg-icon
                    ></a>`,
                )}
              </div>
            </ha-adaptive-popover>
            <ha-button
              size="s"
              variant="neutral"
              appearance="plain"
              .ariaLabel=${this._appDark ? en.ui.appLight : en.ui.appDark}
              @click=${this._toggleAppMode}
              ><ha-svg-icon
                slot="start"
                .path=${this._appDark ? mdiWeatherSunny : mdiWeatherNight}
              ></ha-svg-icon
              >${this._appDark ? en.ui.lightMode : en.ui.darkMode}</ha-button
            >
          </div>
        </div>
      </nav>
      <main>
        ${
          !valid || !entry
            ? html`<section class="heading">
                  ${this._renderCatalogToggle()}
                  <h2>${en.ui.overview}</h2>
                </section>
                ${
                  this._entryId || this._scenarioId
                    ? html`<section class="empty">
                        <p role="alert">${en.ui.unknownRoute}</p>
                        <button @click=${this._back}>${en.ui.back}</button>
                      </section>`
                    : html`<div class="overview">
                        <p class="overview-intro">${en.ui.overviewDescription}</p>
                        ${
                          groups.length
                            ? html`<div
                                class="overview-jumps"
                                role="navigation"
                                aria-label=${en.ui.overviewCategories}
                              >
                                ${groups.map(({ id, entries }) => html`<button data-category=${id} @click=${this._jumpToCategory}>${en.ui.categoryTitles[id]} <span>${entries.length}</span></button>`)}
                              </div>`
                            : nothing
                        }
                        ${groups.map(
                          ({ id, entries }) =>
                            html`<section
                              class="overview-group"
                              aria-labelledby=${`overview-${id}`}
                            >
                              <h3 id=${`overview-${id}`} tabindex="-1">
                                ${icon(categoryIcons[id])}${en.ui.categoryTitles[id]}<span
                                  >${entries.length}</span
                                >
                              </h3>
                              <div class="overview-grid">
                                ${entries.map((item) =>
                                  keyed(
                                    item.meta.id,
                                    html`<a
                                      class="overview-card"
                                      href=${`?component=${encodeURIComponent(item.meta.id)}&scenario=${encodeURIComponent(item.meta.scenarios[0].id)}`}
                                      aria-label=${`${en.ui.openExample} ${item.meta.title} (${item.meta.tag})`}
                                      @click=${this._linkClicked}
                                    >
                                      <knx-gallery-thumbnail
                                        .entry=${item}
                                        .dark=${this._appDark}
                                        aria-hidden="true"
                                      ></knx-gallery-thumbnail>
                                      <div class="overview-caption">
                                        <h4>${item.meta.title}</h4>
                                        <code>${item.meta.tag}</code>
                                        <p>${item.meta.description}</p>
                                        ${this._renderOverviewRelationship(item.meta.id)}
                                      </div>
                                    </a>`,
                                  ),
                                )}
                              </div>
                            </section>`,
                        )}
                        ${!groups.length ? html`<p>${en.ui.noMatches}</p>` : nothing}
                      </div>`
                }`
            : html`
                <section class="heading">
                  ${this._renderCatalogToggle()}
                  <h2 tabindex="-1" .title=${entry.meta.title}>${entry.meta.title}</h2>
                  <section class="scenario-navigation" aria-label=${en.ui.scenario}>
                    ${
                      entry.meta.scenarios.length === 1
                        ? html`<span class="single-scenario"
                            >${en.ui.scenario}:
                            ${entry.meta.scenarios[0].shortLabel ?? entry.meta.scenarios[0].label}</span
                          >`
                        : html`
                            ${scenarioTabs}
                            <ha-select
                              id="gallery-scenario"
                              .label=${en.ui.scenario}
                              .value=${this._scenarioId}
                              .options=${entry.meta.scenarios.map((scenario) => ({ value: scenario.id, label: scenario.shortLabel ?? scenario.label }))}
                              @selected=${this._scenarioChanged}
                            ></ha-select>
                          `
                    }
                  </section>
                  <ha-icon-button
                    .label=${en.ui.reset}
                    .path=${mdiUndoVariant}
                    @click=${this._reset}
                  ></ha-icon-button>
                  <ha-icon-button
                    id="inspector-toggle"
                    class="inspector-toggle"
                    .label=${inspectorVisible ? en.ui.closeInspector : en.ui.openInspector}
                    .path=${mdiDockRight}
                    .selected=${inspectorVisible}
                    aria-expanded=${inspectorVisible ? "true" : "false"}
                    aria-controls="inspector"
                    @click=${this._toggleInspector}
                  ></ha-icon-button>
                </section>
                <div
                  id="scenario-workspace"
                  class=${`workspace${this._inspectorCollapsed ? " inspector-collapsed" : ""}`}
                >
                  <section class="preview-area">
                    <div class="canvas-toolbar">
                      <div class="device-tools">
                        <ha-dropdown
                          class="toolbar-menu device-menu"
                          @wa-select=${this._presetWidth}
                        >
                          <ha-button
                            slot="trigger"
                            size="s"
                            appearance="plain"
                            variant="neutral"
                            .ariaLabel=${`${en.ui.device}: ${deviceSummary}`}
                            .title=${deviceSummary}
                          >
                            <ha-svg-icon .path=${selectedDevice?.icon ?? mdiMonitor}></ha-svg-icon
                            ><ha-svg-icon slot="end" .path=${mdiChevronDown}></ha-svg-icon>
                          </ha-button>
                          ${devices.map((device) => html`<ha-dropdown-item type="checkbox" .value=${String(device.width)} .checked=${this._selectedDevices.some((item) => item.id === device.id)} .selected=${this._selectedDevices.some((item) => item.id === device.id)}>${en.ui.devices[device.id]} · ${device.width} px</ha-dropdown-item>`)}
                        </ha-dropdown>
                        <div
                          class="device-presets"
                          role="group"
                          aria-label=${en.ui.device}
                          title=${en.ui.multiDeviceHelp}
                        >
                          ${devices.map(
                            (device) =>
                              html`<ha-button
                                size="s"
                                data-width=${device.width}
                                aria-pressed=${this._selectedDevices.some((item) => item.id === device.id) ? "true" : "false"}
                                .appearance=${this._selectedDevices.some((item) => item.id === device.id) ? "accent" : "plain"}
                                .variant=${this._selectedDevices.some((item) => item.id === device.id) ? "brand" : "neutral"}
                                .ariaLabel=${`${en.ui.devices[device.id]} · ${device.width} px${this._selectedDevices.some((item) => item.id === device.id) ? ` · ${en.ui.selected}` : ""}`}
                                .title=${`${en.ui.devices[device.id]} · ${device.width} px. ${en.ui.multiDeviceHelp}`}
                                @click=${this._presetWidth}
                              >
                                <ha-svg-icon slot="start" .path=${device.icon}></ha-svg-icon
                                ><span class="device-label">${en.ui.devices[device.id]}</span>
                              </ha-button>`,
                          )}
                        </div>
                        ${this._renderWidthInput("preview-width")}
                        <ha-button
                          class="auto-height-button"
                          size="s"
                          .appearance=${this._autoHeight ? "accent" : "plain"}
                          .variant=${this._autoHeight ? "brand" : "neutral"}
                          .ariaLabel=${`${en.ui.autoHeight}${this._autoHeight ? ` · ${en.ui.selected}` : ""}`}
                          .title=${en.ui.autoHeightHelp}
                          @click=${this._toggleAutoHeight}
                          ><ha-svg-icon slot="start" .path=${mdiArrowCollapseVertical}></ha-svg-icon
                          ><span class="auto-height-label">${en.ui.autoHeight}</span></ha-button
                        >
                      </div>
                      <div class="view-tools">
                        <ha-dropdown
                          class="toolbar-menu view-mode-menu"
                          @wa-select=${this._setViewMode}
                        >
                          <ha-button
                            slot="trigger"
                            size="s"
                            appearance="plain"
                            variant="neutral"
                            .ariaLabel=${`${en.ui.viewMode}: ${en.ui.viewModes[this._viewMode]}`}
                            >${en.ui.viewModes[this._viewMode]}<ha-svg-icon
                              slot="end"
                              .path=${mdiChevronDown}
                            ></ha-svg-icon
                          ></ha-button>
                          ${(["preview", "split", "code"] as const).map((mode) => html`<ha-dropdown-item .value=${mode} .selected=${this._viewMode === mode}>${en.ui.viewModes[mode]}</ha-dropdown-item>`)}
                        </ha-dropdown>
                        <ha-dropdown
                          class="toolbar-menu theme-mode-menu"
                          @wa-select=${this._setPreviewMode}
                        >
                          <ha-button
                            slot="trigger"
                            size="s"
                            appearance="plain"
                            variant="neutral"
                            .ariaLabel=${`${en.ui.previewMode}: ${en.ui[previewMode]}`}
                            .title=${en.ui[previewMode]}
                            ><ha-svg-icon .path=${modeIcons[previewMode]}></ha-svg-icon
                            ><ha-svg-icon slot="end" .path=${mdiChevronDown}></ha-svg-icon
                          ></ha-button>
                          ${(["light", "dark", "compare"] as const).map((mode) => html`<ha-dropdown-item .value=${mode} .selected=${previewMode === mode}>${en.ui[mode]}</ha-dropdown-item>`)}
                        </ha-dropdown>
                        <div
                          class="canvas-modes display-modes"
                          role="group"
                          aria-label=${en.ui.viewMode}
                        >
                          ${(["preview", "split", "code"] as const).map(
                            (mode) =>
                              html`<ha-button
                                size="s"
                                data-view=${mode}
                                .appearance=${this._viewMode === mode ? "accent" : "plain"}
                                .variant=${this._viewMode === mode ? "brand" : "neutral"}
                                .ariaLabel=${`${en.ui.viewModes[mode]}${this._viewMode === mode ? ` · ${en.ui.selected}` : ""}`}
                                @click=${this._setViewMode}
                                >${en.ui.viewModes[mode]}</ha-button
                              >`,
                          )}
                        </div>
                        <div
                          class="canvas-modes theme-modes"
                          role="group"
                          aria-label=${`${en.ui.previewMode}: ${en.ui[this._compare ? "compare" : this._theme.mode]}`}
                        >
                          ${(["light", "dark", "compare"] as const).map((mode) => {
                            const selected =
                              mode === (this._compare ? "compare" : this._theme.mode);
                            return html`<ha-button
                              size="s"
                              data-mode=${mode}
                              .appearance=${selected ? "accent" : "plain"}
                              .variant=${selected ? "brand" : "neutral"}
                              .ariaLabel=${`${en.ui[mode]}${selected ? ` · ${en.ui.selected}` : ""}`}
                              .title=${en.ui[mode]}
                              @click=${this._setPreviewMode}
                              ><ha-svg-icon slot="start" .path=${modeIcons[mode]}></ha-svg-icon
                              ><span class="mode-label">${en.ui[mode]}</span></ha-button
                            >`;
                          })}
                        </div>
                        <ha-button
                          class="alignment-toggle"
                          size="s"
                          .appearance=${this._alignment ? "accent" : "plain"}
                          .variant=${this._alignment ? "brand" : "neutral"}
                          .ariaLabel=${`${en.ui.inspectAlignment}${this._alignment ? ` · ${en.ui.selected}` : ""}`}
                          .title=${en.ui.inspectAlignment}
                          @click=${this._toggleAlignment}
                          ><ha-svg-icon .path=${mdiRulerSquare}></ha-svg-icon
                        ></ha-button>
                        <ha-button
                          class="bounds-toggle"
                          size="s"
                          variant="neutral"
                          .appearance=${this._bounds ? "accent" : "plain"}
                          .ariaLabel=${`${en.ui.bounds}${this._bounds ? ` · ${en.ui.selected}` : ""}`}
                          .title=${en.ui.bounds}
                          @click=${this._toggleBounds}
                          ><ha-svg-icon .path=${mdiBorderOutside}></ha-svg-icon
                        ></ha-button>
                        <ha-icon-button
                          class="preview-options-toggle"
                          .label=${en.ui.previewOptions}
                          .path=${mdiTune}
                          @click=${this._openSettings}
                        ></ha-icon-button>
                      </div>
                    </div>
                    ${this._renderCanvasNavigation()}
                    <div
                      class=${`preview-content view-${this._viewMode}${this._compare || this._selectedDevices.length > 1 ? " comparing" : ""}`}
                    >
                      <div class="canvas-stage" ?hidden=${this._viewMode === "code"}>
                        <div
                          class="canvas"
                          tabindex="0"
                          role="region"
                          aria-label=${en.ui.canvas}
                          title=${en.ui.canvasPanHelp}
                        >
                          <div
                            class="canvas-scroll-content"
                            style=${`width: ${Math.max(this._stageSize.width, this._boardSize.width * this._scale + 48)}px; height: ${Math.max(this._stageSize.height, this._boardSize.height * this._scale + 48)}px;`}
                          >
                            <div
                              class="canvas-board"
                              style=${`grid-template-columns: ${columns.map((device) => `${device.width + 2}px`).join(" ")}; left: ${Math.max(24, (this._stageSize.width - this._boardSize.width * this._scale) / 2)}px; top: ${Math.max(24, (this._stageSize.height - this._boardSize.height * this._scale) / 2)}px; transform: scale(${this._scale});`}
                            >
                              ${keyed(
                                this._sessionId,
                                repeat(
                                  previews,
                                  (pane) => pane.key,
                                  (pane) => this._renderPreview(pane.device, pane.comparison),
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                        ${this._renderAlignment()}
                      </div>
                      ${this._renderCode()}
                    </div>
                    <ha-adaptive-popover
                      .open=${this._settingsOpen}
                      .dialogAnchor=${this._settingsAnchor}
                      .headerTitle=${en.ui.previewOptions}
                      .allowModeChange=${true}
                      @closed=${this._closeSettings}
                    >
                      <div class="preview-options">
                        <ha-button
                          class="compact-preview-option"
                          .appearance=${this._alignment ? "accent" : "plain"}
                          .variant=${this._alignment ? "brand" : "neutral"}
                          .ariaLabel=${`${en.ui.inspectAlignment}${this._alignment ? ` · ${en.ui.selected}` : ""}`}
                          @click=${this._toggleAlignment}
                          >${en.ui.inspectAlignment}</ha-button
                        >
                        <div class="compact-preview-option">
                          ${this._renderWidthInput("options-preview-width")}
                        </div>
                        <ha-button
                          class="compact-preview-option"
                          .appearance=${this._autoHeight ? "accent" : "plain"}
                          .variant=${this._autoHeight ? "brand" : "neutral"}
                          .ariaLabel=${`${en.ui.autoHeight}${this._autoHeight ? ` · ${en.ui.selected}` : ""}`}
                          .title=${en.ui.autoHeightHelp}
                          @click=${this._toggleAutoHeight}
                          ><ha-svg-icon slot="start" .path=${mdiArrowCollapseVertical}></ha-svg-icon
                          >${en.ui.autoHeight}</ha-button
                        >
                        <ha-switch
                          class="compact-preview-option"
                          .checked=${this._bounds}
                          @change=${this._toggleBounds}
                          >${en.ui.bounds}</ha-switch
                        >
                        <ha-select
                          id="gallery-theme"
                          .label=${en.ui.theme}
                          .value=${this._theme.theme}
                          .options=${(["default", "knx"] as const).map((theme) => ({ value: theme, label: en.ui[theme] }))}
                          @selected=${this._setTheme}
                        ></ha-select>
                      </div>
                    </ha-adaptive-popover>
                  </section>
                  <aside
                    class="inspector"
                    id="inspector"
                    @keydown=${this._inspectorKeyDown}
                    @toggle=${this._inspectorToggled}
                    ?hidden=${!this._compact && this._inspectorCollapsed}
                    aria-label=${en.ui.inspector}
                    popover=${ifDefined(this._compact ? "auto" : undefined)}
                  >
                    <div class="inspector-header">
                      <h3>${en.ui.inspector}</h3>
                      <ha-icon-button
                        class="compact-only"
                        .label=${en.ui.closeInspector}
                        ?autofocus=${this._compact}
                        .path=${mdiClose}
                        @click=${this._closeInspector}
                      ></ha-icon-button>
                    </div>
                    <div class="inspector-content">
                      ${keyed(
                        this._sessionId,
                        html`<knx-gallery-controls
                          .meta=${entry.meta}
                          .scenarioId=${this._scenarioId}
                          .overrides=${this._overrides}
                          .enabledSlots=${this._enabledSlots}
                          @overrides-changed=${this._overridesChanged}
                          @slots-changed=${this._slotsChanged}
                          >${this._renderRelationships()}</knx-gallery-controls
                        >`,
                      )}
                    </div>
                  </aside>
                  <knx-gallery-event-log
                    .events=${this._events}
                    @clear-log=${this._clearLog}
                  ></knx-gallery-event-log>
                </div>
              `
        }
      </main>
    </div>`;
  }
  static styles = [galleryStyles, shellStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-component-gallery": KnxComponentGallery;
  }
}
