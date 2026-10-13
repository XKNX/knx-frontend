import { noChange, nothing, type TemplateResult } from "lit";
import { getDirectiveClass, isTemplateResult } from "lit/directive-helpers.js";
import { keyed } from "lit/directives/keyed";
import { ref } from "lit/directives/ref";
import en from "./localize/en.json";

const refClass = getDirectiveClass(ref());
const keyedClass = getDirectiveClass(keyed(undefined, nothing));
const escapeTemplate = (text: string) =>
  text.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");

/** Describe the evaluated example, without invoking callbacks or inspecting rendered DOM. */
export function templateToCode(template: TemplateResult): string {
  const findDialog = (
    value: unknown,
  ): { tag: string; params: unknown; modulePath: string } | undefined => {
    if (isTemplateResult(value)) {
      const annotated = value as TemplateResult & {
        galleryDialog?: { tag: string; params: unknown; modulePath: string };
      };
      return annotated.galleryDialog ?? annotated.values.map(findDialog).find(Boolean);
    }
    if (Array.isArray(value)) return value.map(findDialog).find(Boolean);
    return undefined;
  };
  return usageToCode(findDialog(template) ?? template);
}

export function dialogToCode(tag: string, params: unknown, modulePath: string): string {
  return usageToCode({ tag, params, modulePath });
}

function usageToCode(
  usage: TemplateResult | { tag: string; params: unknown; modulePath: string },
): string {
  const imports = new Set<string>();
  const directives = new Set<string>();
  const supplied = new Set<string>();
  const callbacks = new Set<string>();
  const refs = new Set<string>();
  const names = new Set([
    "html",
    "svg",
    "nothing",
    "noChange",
    "ref",
    "keyed",
    "createRef",
    "hass",
    "knx",
    "host",
    "showDialog",
  ]);
  const references = new Map<unknown, string>();
  const ancestors = new Set<object>();

  const reference = (value: unknown, hint: string, group: Set<string>) => {
    const existing = references.get(value);
    if (existing) return existing;
    const base = hint.replace(
      /[^a-zA-Z0-9_$]+(.)?/g,
      (_, next: string) => next?.toUpperCase() ?? "",
    );
    let name = /^[a-zA-Z_$]/.test(base) ? base : `value${base}`;
    // Prefix binding names which may be JavaScript keywords (e.g. .default).
    if (
      /^(default|class|new|delete|return|function|var|let|const|this|in|for|if|else|switch|case|do|while|void|typeof|instanceof|import|export|await|yield|throw|try|catch|finally|super|extends|static|with|break|continue|debugger|true|false|null)$/.test(
        name,
      )
    ) {
      name = `application${name[0].toUpperCase()}${name.slice(1)}`;
    }
    const candidate = name;
    let suffix = 2;
    while (names.has(name)) name = `${candidate}${suffix++}`;
    names.add(name);
    references.set(value, name);
    group.add(name);
    return name;
  };

  const expression = (value: unknown, hint = "value"): string => {
    if ((hint === "hass" || hint === "knx") && value !== null && typeof value === "object") {
      supplied.add(hint);
      return hint;
    }
    if (value === nothing || value === noChange) {
      const name = value === nothing ? "nothing" : "noChange";
      imports.add(name);
      return name;
    }
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "function") return reference(value, hint, callbacks);
    if (isTemplateResult(value)) return templateSource(value as TemplateResult);
    const directiveClass = getDirectiveClass(value);
    if (directiveClass) {
      // Lit captures directive arguments at runtime but omits them from its public type.
      const { values } = value as { values: unknown[] };
      if (directiveClass === refClass) {
        directives.add("ref");
        const target = values[0];
        return `ref(${typeof target === "function" ? reference(target, "attachElement", callbacks) : target === undefined ? "" : reference(target, "elementRef", refs)})`;
      }
      if (directiveClass === keyedClass) {
        directives.add("keyed");
        return `keyed(${expression(values[0], "key")}, ${expression(values[1])})`;
      }
      throw new Error(en.ui.codeUnsupportedDirective);
    }
    if (typeof value === "object") {
      if (ancestors.has(value)) throw new Error(en.ui.codeUnsupportedData);
      if (value instanceof Date) return `new Date(${JSON.stringify(value.toISOString())})`;
      if (
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      ) {
        return reference(value, hint, supplied);
      }
      ancestors.add(value);
      const array = Array.isArray(value);
      const entries = array
        ? value.map((item) => expression(item, hint))
        : Object.entries(value).map(
            ([key, item]) => `${JSON.stringify(key)}: ${expression(item, key)}`,
          );
      const [open, close] = array ? ["[", "]"] : ["{ ", " }"];
      const compact = `${open}${entries.join(", ")}${close}`;
      const result =
        compact.length <= 100
          ? compact
          : `${open.trim()}\n${entries.map((line) => `  ${line.replaceAll("\n", "\n  ")}`).join(",\n")}\n${close.trim()}`;
      ancestors.delete(value);
      return result;
    }
    throw new Error(en.ui.codeUnsupportedValue);
  };

  const templateSource = (result: TemplateResult): string => {
    const tag = result._$litType$ === 2 ? "svg" : "html";
    imports.add(tag);
    let source = "";
    for (let index = 0; index < result.strings.length; index++) {
      const text = result.strings[index];
      source += escapeTemplate(text);
      if (index === result.values.length) continue;
      const binding = /([.@?]?)([\w-]+)\s*=\s*["']?$/.exec(text);
      const value = result.values[index];
      const hint = binding ? (binding[1] === "@" ? `on-${binding[2]}` : binding[2]) : "value";
      const code = expression(value, hint);
      source += "${" + code + "}";
    }
    // Remove the descriptor's source indentation while preserving literal text.
    const indentation = result.strings.join("").match(/\n[ \t]+(?=\S)/g);
    const margin = indentation ? Math.min(...indentation.map((line) => line.length - 1)) : 0;
    if (margin) source = source.replace(new RegExp(`\\n[ \\t]{${margin}}`, "g"), "\n");
    return `${tag}\`${source}\``;
  };

  let code: string;
  const lines: string[] = [];
  if ("tag" in usage) {
    supplied.add("host");
    code = `await showDialog(host, ${JSON.stringify(usage.tag)}, ${expression(usage.params)}, () => import(${JSON.stringify(usage.modulePath)}))`;
    lines.push('import { showDialog } from "@ha/dialogs/make-dialog-manager";');
    lines.push(
      "// host is a Lit element that provides hass and uses the Home Assistant dialog manager.",
    );
  } else {
    code = templateSource(usage);
  }
  if (imports.size) lines.unshift(`import { ${[...imports].join(", ")} } from "lit";`);
  if (directives.has("ref")) {
    lines.push(`import { ${refs.size ? "createRef, " : ""}ref } from "lit/directives/ref.js";`);
  }
  if (directives.has("keyed")) lines.push('import { keyed } from "lit/directives/keyed.js";');
  if (supplied.size) lines.push(`// Application supplies: ${[...supplied].join(", ")}.`);
  if (callbacks.size) {
    lines.push(
      `// Application implements: ${[...callbacks].join(", ")}.`,
      "// Callback bodies and host setup are not included.",
    );
  }
  for (const name of refs) lines.push(`const ${name} = createRef();`);
  return `${lines.join("\n")}\n\n${code};`;
}
