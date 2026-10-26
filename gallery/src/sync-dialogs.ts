export const extraDialogTags = ["dialog-data-table-settings", "dialog-box"] as const;

interface DialogRequest {
  tag: string;
  opener: number[];
  openerTag: string;
  argument?: string;
}

const deleteMethods: Record<string, string> = {
  "knx-entities-view": "_entityDelete",
  "knx-expose-view": "_exposeDelete",
};

function elementPath(root: ParentNode, element: Element): number[] | undefined {
  const path: number[] = [];
  let current: Node = element;
  while (current !== root) {
    if (current instanceof ShadowRoot) {
      path.unshift(-1);
      current = current.host;
    } else {
      const parent = current.parentNode;
      if (!parent || !(current instanceof Element)) return undefined;
      path.unshift(Array.from(parent.children).indexOf(current));
      current = parent;
    }
  }
  return path;
}

function rows(element: Element): { entity_id: string }[] {
  const table = element.shadowRoot?.querySelector("hass-tabs-subpage-data-table");
  const data: unknown = table && Reflect.get(table, "data");
  return Array.isArray(data) ? data.filter((row) => row && typeof row.entity_id === "string") : [];
}

export function extraDialogRequest(event: Event, root: ParentNode): DialogRequest | undefined {
  const detail = (event as CustomEvent).detail;
  const tag = detail?.dialogTag;
  if (!extraDialogTags.includes(tag)) return undefined;
  for (const element of event.composedPath()) {
    if (!(element instanceof Element)) continue;
    let argument: string | undefined;
    if (tag === "dialog-data-table-settings") {
      if (element.localName !== "hass-tabs-subpage-data-table") continue;
    } else {
      const params = detail.dialogParams;
      if (!params?.confirmation || params.prompt || typeof params.text !== "string") continue;
      if (deleteMethods[element.localName]) {
        const hass = Reflect.get(element, "hass");
        argument = rows(element).find(
          (row) => params.text === `${hass.localize("ui.common.delete")} ${row.entity_id}?`,
        )?.entity_id;
        if (!argument) continue;
      } else if (element.localName === "knx-info") {
        if (
          params.text !==
          Reflect.get(element, "knx").localize(
            "component.knx.config_panel.info.project_data.delete",
          )
        ) {
          continue;
        }
      } else continue;
    }
    const opener = elementPath(root, element);
    if (opener) {
      return { tag, opener, openerTag: element.localName, ...(argument ? { argument } : {}) };
    }
  }
  return undefined;
}

export function openExtraDialog(element: Element, tag: string, argument?: string): boolean {
  let method: string;
  let row: { entity_id: string } | undefined;
  if (
    tag === "dialog-data-table-settings" &&
    element.localName === "hass-tabs-subpage-data-table"
  ) {
    method = "_openSettings";
  } else if (tag === "dialog-box" && deleteMethods[element.localName]) {
    row = rows(element).find((entry) => entry.entity_id === argument);
    if (!row) return false;
    method = deleteMethods[element.localName];
  } else if (tag === "dialog-box" && element.localName === "knx-info" && argument === undefined) {
    method = "_removeProject";
  } else return false;
  const open = Reflect.get(element, method);
  if (typeof open !== "function") return false;
  // Confirmation openers can await the user's choice. Never await or confirm them here.
  // Rejections reach the preview's existing unhandledrejection error handler.
  void open.call(element, row);
  return true;
}

export function closeExtraDialog(element: Element): boolean {
  if (element.localName !== "dialog-box") return false;
  const close = Reflect.get(element, "_closeDialog");
  if (typeof close !== "function") return false;
  // A peer dismissal is visual only: neither confirm nor cancel callbacks are replayed.
  Reflect.set(element, "_closeState", "canceled");
  close.call(element);
  return true;
}
