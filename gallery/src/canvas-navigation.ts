export interface CanvasSize {
  width: number;
  height: number;
}

export function fitScale(available: CanvasSize, board: CanvasSize, previous: number): number {
  if (
    ![available.width, available.height, board.width, board.height].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return previous;
  }
  return Math.min(1, available.width / board.width, available.height / board.height);
}

export function stepScale(current: number, direction: -1 | 1): number {
  return Math.min(2, Math.max(0.1, Math.round((current + direction * 0.1) * 10) / 10));
}

// Own only claimed mouse gestures; touch and wheel scrolling remain native.
export class CanvasNavigation {
  private _documents = new Map<
    Document,
    { frame?: HTMLIFrameElement; cursor: string; dispose: () => void }
  >();
  private _spaceDocument?: Document;
  private _drag?: {
    document: Document;
    capture: Element;
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  };
  private _clickDocument?: Document;
  private _events = [
    "keydown",
    "keyup",
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "lostpointercapture",
    "click",
  ];

  public constructor(
    private _surface: HTMLElement,
    private _iframePanningEnabled: () => boolean,
  ) {
    this._bind(_surface.ownerDocument);
  }

  public syncFrames(frames: readonly HTMLIFrameElement[]) {
    const documents = new Map(
      frames
        .filter((frame) => frame.contentDocument)
        .map((frame) => [frame.contentDocument!, frame]),
    );
    for (const [document, binding] of this._documents) {
      if (document === this._surface.ownerDocument || documents.get(document) === binding.frame) {
        continue;
      }
      if (this._drag?.document === document || this._spaceDocument === document) this.cancel();
      if (this._clickDocument === document) this._clickDocument = undefined;
      binding.dispose();
      this._documents.delete(document);
    }
    for (const [document, frame] of documents) {
      if (!this._documents.has(document)) this._bind(document, frame);
    }
  }

  public cancel() {
    this._spaceDocument = undefined;
    this._surface.removeAttribute("data-pan-ready");
    this._endDrag();
  }

  public dispose() {
    this.cancel();
    for (const binding of this._documents.values()) binding.dispose();
    this._documents.clear();
    this._clickDocument = undefined;
  }

  private _cursor(value?: string) {
    for (const [document, binding] of this._documents) {
      const root = document.documentElement;
      if (binding.frame && root) root.style.cursor = value ?? binding.cursor;
    }
  }

  private _bind(document: Document, frame?: HTMLIFrameElement) {
    const root = document.documentElement;
    if (!root) return;
    const cursor = root.style.cursor;
    const listener = (event: Event) => this._event(event, document, frame);
    const blur = (event: Event) => {
      // Focus entering an owned iframe is not loss of browser focus.
      if (!event.isTrusted || !this._surface.ownerDocument.hasFocus()) this.cancel();
    };
    for (const type of this._events) document.addEventListener(type, listener, true);
    document.defaultView?.addEventListener("blur", blur);
    this._documents.set(document, {
      frame,
      cursor,
      dispose: () => {
        if (frame) root.style.cursor = cursor;
        for (const type of this._events) document.removeEventListener(type, listener, true);
        document.defaultView?.removeEventListener("blur", blur);
      },
    });
    if (frame && this._spaceDocument) root.style.cursor = "grab";
  }

  private _control(node: EventTarget | null): boolean {
    const element = node as Element | null;
    return (
      element?.nodeType === 1 &&
      element.matches(
        "input, textarea, select, button, summary, a[href], [contenteditable]:not([contenteditable=false]), [role=button], [role=checkbox], [role=radio], [role=switch], [role=slider], [role=combobox], [role=textbox], [role=menuitem], [role=menuitemcheckbox], [role=tab]",
      )
    );
  }

  private _focusedControl(document: Document): boolean {
    let active = document.activeElement;
    while (active) {
      if (this._control(active)) return true;
      active = active.shadowRoot?.activeElement ?? null;
    }
    return false;
  }

  private _point(event: PointerEvent, frame?: HTMLIFrameElement) {
    if (!frame) return { x: event.clientX, y: event.clientY };
    const rect = frame.getBoundingClientRect();
    const scale = rect.width / frame.clientWidth;
    return { x: rect.left + event.clientX * scale, y: rect.top + event.clientY * scale };
  }

  private _stop(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private _endDrag() {
    const drag = this._drag;
    this._drag = undefined;
    this._surface.removeAttribute("data-panning");
    this._cursor(this._spaceDocument ? "grab" : undefined);
    if (drag?.capture.hasPointerCapture(drag.id)) drag.capture.releasePointerCapture(drag.id);
  }

  private _event(event: Event, document: Document, frame?: HTMLIFrameElement) {
    if (event.type === "keydown" || event.type === "keyup") {
      const key = event as KeyboardEvent;
      if (key.key === "Escape") {
        this.cancel();
        return;
      }
      if (key.code !== "Space") return;
      if (event.type === "keyup") {
        if (this._spaceDocument) {
          this._stop(event);
          this.cancel();
        }
        return;
      }
      if (
        !this._iframePanningEnabled() ||
        this._focusedControl(document) ||
        event.composedPath().some((node) => this._control(node))
      ) {
        return;
      }
      if (!frame && !event.composedPath().includes(this._surface)) return;
      this._stop(event);
      this._spaceDocument = document;
      this._surface.setAttribute("data-pan-ready", "");
      this._cursor("grab");
      return;
    }
    if (event.type === "click") {
      if (this._clickDocument === document && (event as MouseEvent).detail > 0) {
        this._clickDocument = undefined;
        this._stop(event);
      }
      return;
    }
    const pointer = event as PointerEvent;
    if (event.type === "pointercancel" || event.type === "lostpointercapture") {
      if (this._drag?.document === document) this.cancel();
      return;
    }
    if (event.type === "pointerdown") {
      this._clickDocument = undefined;
      if (pointer.button !== 0 || pointer.pointerType !== "mouse") return;
      const path = event.composedPath();
      if (frame) {
        if (
          !this._spaceDocument ||
          !this._iframePanningEnabled() ||
          this._focusedControl(document) ||
          path.some((node) => this._control(node))
        ) {
          return;
        }
      } else if (
        !path.includes(this._surface) ||
        path.some(
          (node) =>
            (node as Element).nodeType === 1 &&
            (node as Element).classList.contains("preview-card"),
        )
      ) {
        return;
      }
      this._stop(event);
      const capture = frame ? document.documentElement : this._surface;
      const point = this._point(pointer, frame);
      this._drag = {
        document,
        capture,
        id: pointer.pointerId,
        ...point,
        left: this._surface.scrollLeft,
        top: this._surface.scrollTop,
      };
      this._clickDocument = document;
      this._surface.setAttribute("data-panning", "");
      this._cursor("grabbing");
      capture.setPointerCapture(pointer.pointerId);
      return;
    }
    const drag = this._drag;
    if (!drag || drag.document !== document || drag.id !== pointer.pointerId) return;
    this._stop(event);
    if (event.type === "pointermove") {
      const point = this._point(pointer, frame);
      this._surface.scrollLeft = drag.left + drag.x - point.x;
      this._surface.scrollTop = drag.top + drag.y - point.y;
    } else if (event.type === "pointerup") this._endDrag();
  }
}
