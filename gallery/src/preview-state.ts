/* eslint-disable no-await-in-loop -- Owners must render before descendant state and dialogs can be applied. */
import { LitElement } from "lit";
import type { TelegramDict } from "../../src/types/websocket";
import { isTelegramHistory, mergeTelegramHistory, telegramAdditions } from "./fixtures/telegrams";
import { catalog } from "./catalog";
import { isJsonValue, isRecord } from "./state";
import {
  extraDialogTags,
  extraDialogRequest,
  openExtraDialog,
  closeExtraDialog,
} from "./sync-dialogs";
import { dialogOpeners, syncBindings } from "./sync-bindings";
import type { GalleryFixtureState, GalleryValues, JsonValue } from "./types";

interface StateValue {
  kind: "json" | "undefined" | "set" | "date" | "row";
  value: JsonValue;
}
export interface PreviewElementState {
  path: number[];
  tag: string;
  values: Record<string, StateValue>;
}
export interface PreviewDialogState {
  tag: string;
  opener: number[] | null;
  openerTag: string;
  argument?: string;
}
export interface PreviewState {
  elements: PreviewElementState[];
  dialogs: PreviewDialogState[];
  route: string;
  fixtures?: GalleryValues;
}

/** Accept history independently of the originating pane's old UI snapshot. */
export function mergeFixtureTelegrams(
  state: PreviewState,
  telegrams: TelegramDict[],
): PreviewState {
  if (!isTelegramHistory(telegrams) || !isTelegramHistory(state.fixtures?.telegrams)) return state;
  const fixtures = structuredClone(state.fixtures!);
  fixtures.telegrams = mergeTelegramHistory(
    state.fixtures!.telegrams as unknown as TelegramDict[],
    telegrams,
  ) as unknown as JsonValue;
  const running = state.elements.some(
    (element) =>
      element.tag === "knx-group-monitor" &&
      element.values["controller._isPaused"]?.value === false,
  );
  if (running && isTelegramHistory(fixtures.monitor)) {
    // Only the newly accepted rows enter the visible monitor; cleared rows stay cleared.
    const previous = state.fixtures!.telegrams as unknown as TelegramDict[];
    const added = telegramAdditions(previous, telegrams);
    fixtures.monitor = mergeTelegramHistory(fixtures.monitor, added) as unknown as JsonValue;
  }
  return { ...state, fixtures };
}

const properties = (tag: string) => syncBindings[tag] ?? [];

function encode(value: unknown): StateValue | undefined {
  if (value === undefined) return { kind: "undefined", value: null };
  if (value instanceof Set) {
    const items = [...value];
    return isJsonValue(items) ? { kind: "set", value: items } : undefined;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? { kind: "date", value: value.toISOString() }
      : undefined;
  }
  return isJsonValue(value)
    ? { kind: "json", value: JSON.parse(JSON.stringify(value)) }
    : undefined;
}
function decode(value: StateValue, element: Element): unknown {
  switch (value.kind) {
    case "row":
      return (Reflect.get(element, "filteredTelegrams") as unknown[] | undefined)?.[
        value.value as number
      ];
    case "undefined":
      return undefined;
    case "set":
      return new Set(value.value as JsonValue[]);
    case "date":
      return new Date(value.value as string);
    default:
      return value.value;
  }
}
function owner(element: Element, property: string): { object: object; key: string } | undefined {
  const keys = property.split(".");
  let object: unknown = element;
  for (const key of keys.slice(0, -1)) {
    if (!object || typeof object !== "object") return undefined;
    object = Reflect.get(object, key);
  }
  const key = keys[keys.length - 1];
  return object && typeof object === "object" && key in object ? { object, key } : undefined;
}

export function stateElements(root: ParentNode): { element: Element; path: number[] }[] {
  const result: { element: Element; path: number[] }[] = [];
  const visit = (parent: ParentNode, path: number[]) => {
    Array.from(parent.children).forEach((element, index) => {
      const next = [...path, index];
      result.push({ element, path: next });
      if (element.shadowRoot) visit(element.shadowRoot, [...next, -1]);
      visit(element, next);
    });
  };
  visit(root, []);
  return result;
}
export function stateElement(root: ParentNode, path: number[]): Element | undefined {
  let current: ParentNode | undefined = root;
  for (const index of path) {
    current =
      index === -1 ? ((current as Element)?.shadowRoot ?? undefined) : current?.children[index];
  }
  return current instanceof Element ? current : undefined;
}

function readValue(element: Element, property: string, target: { object: object; key: string }) {
  const value = Reflect.get(target.object, target.key);
  if (
    element.localName === "knx-group-monitor-telegram-info-dialog" &&
    property === "_params.telegram"
  ) {
    const index = (Reflect.get(element, "filteredTelegrams") as unknown[] | undefined)?.indexOf(
      value,
    );
    if (index !== undefined && index >= 0) return { kind: "row" as const, value: index };
  }
  return encode(value);
}

export function captureElements(root: ParentNode): PreviewElementState[] {
  return stateElements(root).flatMap(({ element, path }) => {
    if (element instanceof HTMLInputElement && element.type === "file") return [];
    const values: Record<string, StateValue> = {};
    for (const property of properties(element.localName)) {
      const target = owner(element, property);
      if (!target) continue;
      const value = readValue(element, property, target);
      if (value) values[property] = value;
    }
    return Object.keys(values).length ? [{ path, tag: element.localName, values }] : [];
  });
}
export async function applyElements(
  root: ParentNode,
  states: PreviewElementState[],
  current = () => true,
) {
  for (const state of states) {
    if (!current()) return;
    const element = stateElement(root, state.path);
    if (!element || element.localName !== state.tag) continue;
    if (element instanceof HTMLInputElement && element.type === "file") continue;
    let changed = false;
    for (const [property, value] of Object.entries(state.values)) {
      if (!properties(state.tag).includes(property)) continue;
      const target = owner(element, property);
      if (
        !target ||
        JSON.stringify(readValue(element, property, target)) === JSON.stringify(value)
      ) {
        continue;
      }
      if (
        property === "_pickerWrapperOpen" &&
        value.value === true &&
        ["ha-generic-picker", "ha-date-range-picker"].includes(element.localName)
      ) {
        // Opening computes viewport-local geometry and installs the picker keyboard handlers.
        const open = Reflect.get(element, "open");
        if (typeof open === "function") await open.call(element);
      }
      if (!current()) return;
      Reflect.set(target.object, target.key, decode(value, element));
      changed = true;
    }
    if (changed && element instanceof LitElement) {
      element.requestUpdate();
      await element.updateComplete;
    }
  }
}
const isPath = (path: unknown): path is number[] =>
  Array.isArray(path) &&
  path.length <= 100 &&
  path.every((index) => Number.isSafeInteger(index) && index >= -1 && index < 10000);
const isTag = (tag: unknown): tag is string =>
  typeof tag === "string" && /^[a-z][a-z0-9-]*$/.test(tag);
export function isPreviewState(value: unknown): value is PreviewState {
  if (
    !isRecord(value) ||
    !isJsonValue(value) ||
    Object.keys(value).length !== (value.fixtures === undefined ? 3 : 4) ||
    (value.fixtures !== undefined && !isRecord(value.fixtures)) ||
    typeof value.route !== "string" ||
    (value.route !== "" && !value.route.startsWith("#/knx")) ||
    !Array.isArray(value.elements) ||
    value.elements.length > 10000 ||
    !Array.isArray(value.dialogs)
  ) {
    return false;
  }
  return (
    value.elements.every(
      (item) =>
        isRecord(item) &&
        Object.keys(item).length === 3 &&
        isPath(item.path) &&
        isTag(item.tag) &&
        isRecord(item.values) &&
        Object.entries(item.values).every(
          ([key, entry]) =>
            properties(item.tag as string).includes(key) &&
            isRecord(entry) &&
            Object.keys(entry).length === 2 &&
            ((entry.kind === "row" &&
              item.tag === "knx-group-monitor-telegram-info-dialog" &&
              key === "_params.telegram" &&
              typeof entry.value === "number" &&
              Number.isSafeInteger(entry.value) &&
              entry.value >= 0) ||
              (entry.kind === "undefined" && entry.value === null) ||
              (entry.kind === "json" && isJsonValue(entry.value)) ||
              (entry.kind === "set" && Array.isArray(entry.value) && isJsonValue(entry.value)) ||
              (entry.kind === "date" &&
                typeof entry.value === "string" &&
                Number.isFinite(Date.parse(entry.value)))),
        ),
    ) &&
    value.dialogs.length <= 20 &&
    value.dialogs.every(
      (item) =>
        isRecord(item) &&
        Object.keys(item).length === (item.argument === undefined ? 3 : 4) &&
        (item.argument === undefined || typeof item.argument === "string") &&
        isTag(item.tag) &&
        (catalog.some(({ meta }) => meta.tag === item.tag && meta.category === "dialogs") ||
          extraDialogTags.some((tag) => tag === item.tag)) &&
        (item.opener === null || isPath(item.opener)) &&
        typeof item.openerTag === "string" &&
        (item.opener === null ||
          Boolean(dialogOpeners[item.openerTag]?.[item.tag]) ||
          (item.tag === "dialog-data-table-settings" &&
            item.openerTag === "hass-tabs-subpage-data-table") ||
          (item.tag === "dialog-box" &&
            ["knx-entities-view", "knx-expose-view", "knx-info"].includes(item.openerTag))),
    )
  );
}

/** One local writer; applying a peer snapshot never creates another interaction. */
export class PreviewSync {
  private _disposed = false;
  private _author = false;
  private _producer = false;
  private _revision = 0;
  private _applying = false;
  private _frame = 0;
  private _signature = "";
  private _requests = new Map<string, PreviewDialogState>();
  private _observer = new MutationObserver(() => {
    this.schedule();
  });
  private _events = ["click", "input", "change", "keydown", "pointerup"];
  public constructor(
    private _host: LitElement,
    private _emit: (state: PreviewState, interaction: boolean, revision: number) => void,
    private _claim: (revision: number) => void,
    private _fixtures: () => GalleryFixtureState | undefined = () => undefined,
  ) {
    for (const event of this._events) _host.addEventListener(event, this._interaction, true);
    _host.addEventListener("show-dialog", this._dialogRequested, true);
    window.addEventListener("location-changed", this._locationChanged);
    window.addEventListener("popstate", this._locationChanged);
  }
  public get revision() {
    return this._revision;
  }
  public get canProduce() {
    return this._producer && !this._applying && !this._disposed;
  }
  public setWriter(active: boolean, revision: number) {
    if (revision !== this._revision || this._disposed) return;
    this._producer = active;
    if (!active) this._author = false;
  }
  public fixtureChanged() {
    if (this.canProduce) this._author = true;
    this.schedule();
  }
  public get applying() {
    return this._applying;
  }
  public dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._frame);
    this._observer.disconnect();
    for (const event of this._events) {
      this._host.removeEventListener(event, this._interaction, true);
    }
    this._host.removeEventListener("show-dialog", this._dialogRequested, true);
    window.removeEventListener("location-changed", this._locationChanged);
    window.removeEventListener("popstate", this._locationChanged);
  }
  private _interaction = (event: Event) => {
    if (!event.isTrusted) return;
    this._author = true;
    this._signature = "";
    this._claim(++this._revision);
    this.schedule();
  };
  private _locationChanged = () => {
    if (this._author) this.schedule();
  };
  private _dialogRequested = (event: Event) => {
    const extra = extraDialogRequest(event, this._host.renderRoot);
    if (extra) {
      this._requests.set(extra.tag, extra);
      return;
    }
    const tag = (event as CustomEvent<{ dialogTag?: string }>).detail?.dialogTag;
    if (!tag) return;
    const opener = event
      .composedPath()
      .find((node) => node instanceof Element && dialogOpeners[node.localName]?.[tag]) as
      Element | undefined;
    const path = stateElements(this._host.renderRoot).find(
      ({ element }) => element === opener,
    )?.path;
    if (opener && path) this._requests.set(tag, { tag, opener: path, openerTag: opener.localName });
  };
  public schedule() {
    if (this._disposed || this._frame || this._applying) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this.capture();
    });
  }
  private _dialogs() {
    return stateElements(this._host.renderRoot).filter(
      ({ element }) =>
        (catalog.some(
          ({ meta }) => meta.tag === element.localName && meta.category === "dialogs",
        ) ||
          extraDialogTags.some((tag) => tag === element.localName)) &&
        stateElements(element.shadowRoot ?? element).some(
          ({ element: child }) =>
            ["ha-dialog", "ha-adaptive-dialog", "ha-adaptive-popover", "ha-bottom-sheet"].includes(
              child.localName,
            ) && Reflect.get(child, "open"),
        ),
    );
  }
  public capture() {
    if (this._disposed || this._applying || !this._host.isConnected) return;
    const root = this._host.renderRoot;
    this._fixtures()?.refresh?.(root);
    this._observer.disconnect();
    this._observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    for (const { element } of stateElements(root)) {
      if (element.shadowRoot) {
        this._observer.observe(element.shadowRoot, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      }
    }
    const state: PreviewState = {
      elements: captureElements(root),
      dialogs: this._dialogs().map(
        ({ element }) =>
          this._requests.get(element.localName) ?? {
            tag: element.localName,
            opener: null,
            openerTag: "",
          },
      ),
      route: location.hash.startsWith("#/knx") ? location.hash : "",
      ...this._fixtureSnapshot(),
    };
    const signature = JSON.stringify(state);
    if (signature === this._signature) return;
    this._signature = signature;
    this._emit(state, this._author, this._revision);
  }
  private _fixtureSnapshot(): Pick<PreviewState, "fixtures"> {
    const adapter = this._fixtures();
    return adapter ? { fixtures: adapter.capture() } : {};
  }
  private async _waitForDialog(tag: string) {
    const existing = () =>
      stateElements(this._host.renderRoot).find(({ element }) => element.localName === tag)
        ?.element;
    if (existing()) return;
    await new Promise<void>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (existing()) {
          observer.disconnect();
          clearTimeout(timer);
          resolve();
        }
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Comparison could not open ${tag}.`));
      }, 5000);
      observer.observe(this._host.renderRoot, { subtree: true, childList: true });
    });
  }
  public async apply(state: PreviewState, revision: number) {
    const current = () => !this._disposed && this._host.isConnected && revision === this._revision;
    if (!current()) return;
    this._author = false;
    this._applying = true;
    cancelAnimationFrame(this._frame);
    this._frame = 0;
    try {
      // Install successful outcomes before navigation mounts readers of the local fixtures.
      if (state.fixtures) this._fixtures()?.apply(structuredClone(state.fixtures));
      if (state.route && location.hash !== state.route) {
        history.replaceState(
          history.state,
          "",
          `${location.pathname}${location.search}${state.route}`,
        );
        window.dispatchEvent(new CustomEvent("location-changed"));
        await this._host.updateComplete;
      }
      for (const { element } of this._dialogs().reverse()) {
        if (!current()) return;
        if (!state.dialogs.some(({ tag }) => tag === element.localName)) {
          if (closeExtraDialog(element)) continue;
          const close = Reflect.get(element, "closeDialog");
          if (typeof close === "function") await close.call(element);
        }
      }
      // Owners render their descendants before we apply nested controls.
      await applyElements(this._host.renderRoot, state.elements, current);
      for (const dialog of state.dialogs) {
        if (!current()) return;
        if (this._dialogs().some(({ element }) => element.localName === dialog.tag)) continue;
        const opener = dialog.opener && stateElement(this._host.renderRoot, dialog.opener);
        if (
          opener &&
          opener.localName === dialog.openerTag &&
          extraDialogTags.some((tag) => tag === dialog.tag)
        ) {
          if (!openExtraDialog(opener, dialog.tag, dialog.argument)) continue;
        } else if (opener && opener.localName === dialog.openerTag) {
          const method = dialogOpeners[dialog.openerTag]?.[dialog.tag];
          const open = method && Reflect.get(opener, method);
          if (typeof open === "function") await open.call(opener);
        } else {
          const button = stateElements(this._host.renderRoot).find(
            ({ element }) => element.getAttribute("data-gallery-dialog") === dialog.tag,
          )?.element;
          if (!button) continue;
          button.dispatchEvent(new Event("gallery-open-dialog"));
        }
        if (!current()) return;
        await this._waitForDialog(dialog.tag);
      }
      await applyElements(this._host.renderRoot, state.elements, current);
      await this._host.updateComplete;
      this._fixtures()?.refresh?.(this._host.renderRoot);
    } finally {
      this._applying = false;
      this._author = !current();
      if (this._author) {
        this._signature = "";
        this.schedule();
      } else {
        // Refresh observer roots and baseline without reflecting the peer state back.
        this._signature = JSON.stringify({
          elements: captureElements(this._host.renderRoot),
          dialogs: this._dialogs().map(
            ({ element }) =>
              this._requests.get(element.localName) ?? {
                tag: element.localName,
                opener: null,
                openerTag: "",
              },
          ),
          route: location.hash.startsWith("#/knx") ? location.hash : "",
          ...this._fixtureSnapshot(),
        });
        this.capture();
      }
    }
  }
}
