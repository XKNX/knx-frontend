// Gallery-only inspection of the live iframe DOM, including open shadow roots.
export class AlignmentGuides {
  public readonly pinned = new Set<Element>();
  public chain: Element[] = [];
  private _hovered?: Element;
  private _level = 0;
  private _layer: HTMLDivElement;
  private _animation = 0;
  private _geometry = "";
  private _events = [
    "pointerover",
    "pointermove",
    "pointerout",
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "contextmenu",
    "dragstart",
    "keydown",
    "beforeinput",
    "paste",
    "cut",
    "drop",
  ];

  public constructor(
    public readonly document: Document,
    private _changed: (guides: AlignmentGuides) => void,
    private _exit: () => void,
    private _scale: () => number,
  ) {
    this._layer = document.createElement("div");
    this._layer.dataset.galleryGuides = "";
    this._layer.setAttribute("aria-hidden", "true");
    // A manual popover also paints above an already-open component dialog.
    this._layer.popover = "manual";
    this._layer.style.cssText =
      "position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100vh;pointer-events:none;background:transparent;overflow:hidden;";
    document.body.append(this._layer);
    this._layer.showPopover();
    for (const event of this._events) {
      document.defaultView!.addEventListener(event, this._event, true);
    }
    this._draw();
  }

  public static label(element: Element) {
    return `<${element.localName}>${element.id ? ` #${element.id}` : ""}`;
  }

  public select(index: number) {
    const element = this.chain[index];
    if (!element?.isConnected) return;
    this._level = index;
    this._hovered = element;
    if (this.pinned.has(element)) this.pinned.delete(element);
    else this.pinned.add(element);
    this._changed(this);
  }

  public reset() {
    this.pinned.clear();
    this.chain = [];
    this._hovered = undefined;
    this._level = 0;
    this._changed(this);
  }

  public dispose() {
    cancelAnimationFrame(this._animation);
    for (const event of this._events) {
      this.document.defaultView?.removeEventListener(event, this._event, true);
    }
    this._layer.remove();
    this.pinned.clear();
    this.chain = [];
  }

  private _pick(event: Event) {
    const chain = event.composedPath().filter((node): node is Element => {
      const element = node as Element;
      if (
        element.nodeType !== 1 ||
        element === this.document.body ||
        element === this.document.documentElement ||
        this._layer.contains(element)
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (chain[0] !== this.chain[0]) {
      this.chain = chain;
      this._level = 0;
      this._changed(this);
    }
    this._hovered = this.chain[this._level];
  }

  private _event = (event: Event) => {
    if (event.type === "pointermove" || event.type === "pointerover") {
      this._pick(event);
      return;
    }
    if (event.type === "pointerout") {
      if (!(event as PointerEvent).relatedTarget) this._hovered = undefined;
      return;
    }
    if (event.type === "keydown") {
      const key = (event as KeyboardEvent).key;
      if (key === "Tab" || key === "Shift") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === "Escape") this._exit();
      else if (key === "Enter" || key === " ") {
        this._pick(event);
        this.select(this._level);
      }
      return;
    }
    // Cancel before events reach component handlers, including drag/focus activation.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") {
      this._pick(event);
      this.select(this._level);
    }
  };

  private _draw = () => {
    let removed = false;
    for (const element of this.pinned) {
      if (!element.isConnected) {
        this.pinned.delete(element);
        removed = true;
      }
    }
    if (this.chain.some((element) => !element.isConnected)) {
      this.chain = [];
      this._hovered = undefined;
      removed = true;
    }
    if (removed) this._changed(this);
    const view = this.document.defaultView!;
    const rectangles = [
      ...this.pinned,
      ...(this._hovered && !this.pinned.has(this._hovered) ? [this._hovered] : []),
    ]
      .filter(
        (element) => element.isConnected && view.getComputedStyle(element).visibility !== "hidden",
      )
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
        fixed: this.pinned.has(element),
      }))
      .filter(
        ({ rect }) =>
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < view.innerWidth &&
          rect.top < view.innerHeight,
      );
    const scale = this._scale();
    const geometry = JSON.stringify([
      scale,
      view.innerWidth,
      view.innerHeight,
      ...rectangles.map(({ rect, fixed, element }) => [
        element.localName,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        fixed,
      ]),
    ]);
    if (geometry !== this._geometry) {
      this._geometry = geometry;
      const svg = this.document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      for (const { element, rect, fixed } of rectangles) {
        const group = this.document.createElementNS(svg.namespaceURI, "g");
        group.setAttribute("data-kind", fixed ? "fixed" : "hover");
        group.setAttribute("data-element", element.localName);
        group.setAttribute("stroke", fixed ? "#c07800" : "#0092bd");
        group.setAttribute("stroke-width", String(1 / scale));
        if (!fixed) group.setAttribute("stroke-dasharray", `${4 / scale} ${3 / scale}`);
        for (const [x1, y1, x2, y2] of [
          [rect.left, 0, rect.left, view.innerHeight],
          [rect.right, 0, rect.right, view.innerHeight],
          [0, rect.top, view.innerWidth, rect.top],
          [0, rect.bottom, view.innerWidth, rect.bottom],
        ]) {
          const line = this.document.createElementNS(svg.namespaceURI, "line");
          Object.entries({ x1, y1, x2, y2 }).forEach(([key, value]) =>
            line.setAttribute(key, String(value)),
          );
          group.append(line);
        }
        svg.append(group);
      }
      this._layer.replaceChildren(svg);
    }
    // Geometry can change during scrolling or animation; read only while inspection is active.
    this._animation = requestAnimationFrame(this._draw);
  };
}
