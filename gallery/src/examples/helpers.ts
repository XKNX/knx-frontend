import { deepEqual } from "@ha/common/util/deep-equal";
import { isJsonValue, isRecord, resolveValues } from "../state";
import en from "../localize/en.json" with { type: "json" };
import type {
  GalleryControl,
  GalleryDefinition,
  GalleryEntry,
  GalleryEnvironment,
  GalleryEvent,
  GalleryMeta,
} from "../types";

// Normalize authoring data without importing or executing product code.
export function defineExample(definition: GalleryDefinition): GalleryEntry {
  const { tag, copy, properties = {}, exampleOptions = {} } = definition;
  const fail = (field: string, message = en.validation.invalidValue): never => {
    throw new Error(`[${tag.trim() || definition.id || "gallery"}] ${field}: ${message}`);
  };
  const text = (value: string | undefined, field: string) => {
    if (!value?.trim()) fail(field);
    return value!;
  };
  text(tag, "tag");
  text(definition.id ?? tag, "id");
  text(copy.title, "title");
  text(copy.description, "description");
  const names = new Set<string>();
  const declare = (name: string) => {
    text(name, name || "name");
    if (names.has(name)) fail(name);
    names.add(name);
  };
  const controls: GalleryControl[] = [];
  const api: GalleryMeta["api"] = [];
  const document = (name: string, kind: GalleryMeta["api"][number]["kind"]) => {
    api.push({
      name,
      kind,
      description: text(copy.api[name], name),
      ...(definition.apiDetails?.[name] !== undefined
        ? { details: definition.apiDetails[name] }
        : {}),
    });
  };
  for (const [target, defaults] of [
    ["property", properties],
    ["example", exampleOptions],
  ] as const) {
    for (const [key, defaultValue] of Object.entries(defaults)) {
      declare(key);
      if (!isJsonValue({ [key]: defaultValue })) fail(key, en.validation.invalidJson);
      const options = definition.controls?.[key];
      const choices = options?.choices;
      const kind =
        options?.kind ??
        (choices
          ? "select"
          : typeof defaultValue === "boolean"
            ? "boolean"
            : typeof defaultValue === "number"
              ? "number"
              : typeof defaultValue === "string"
                ? "text"
                : "json");
      if (
        choices &&
        (kind !== "select" ||
          !choices.length ||
          !isJsonValue(choices) ||
          choices.some((value, index) =>
            choices.slice(0, index).some((other) => deepEqual(value, other)),
          ))
      ) {
        fail(key);
      }
      if (kind === "select" && !choices) fail(key);
      controls.push({
        key,
        label: text(copy.labels[key], key),
        description: text(copy.api[key], key),
        ...(definition.apiDetails?.[key] !== undefined
          ? { details: definition.apiDetails[key] }
          : {}),
        target,
        defaultValue,
        kind,
        options: choices?.map((value) => ({
          label:
            value !== null && typeof value === "object" ? JSON.stringify(value) : String(value),
          value,
        })),
        validate: (value) => {
          const validRoot =
            kind !== "json" ||
            defaultValue === null ||
            (Array.isArray(defaultValue)
              ? Array.isArray(value)
              : typeof defaultValue === "object"
                ? value !== null && typeof value === "object" && !Array.isArray(value)
                : typeof value === typeof defaultValue);
          return validRoot ? options?.validate?.(value) : en.validation.invalidValue;
        },
      });
      if (target === "property") document(key, "property");
    }
  }
  for (const key of Object.keys(definition.controls ?? {})) {
    if (!controls.some((control) => control.key === key)) fail(key, en.validation.unknownControl);
  }
  for (const [kind, interfaces] of [
    ["property", definition.suppliedProperties ?? []],
    ["method", definition.methods ?? []],
    ["event", definition.events ?? []],
    ["callback", definition.callbacks ?? []],
  ] as const) {
    for (const name of interfaces) {
      declare(name);
      document(name, kind);
    }
  }
  const slotNames = new Set<string>();
  const slots = (definition.slots ?? []).map((name) => {
    const key = name || "default";
    text(key, key);
    if (slotNames.has(key)) fail(key);
    slotNames.add(key);
    names.add(key);
    document(key, "slot");
    return { name, label: text(copy.labels[key], key) };
  });
  for (const key of Object.keys(definition.apiDetails ?? {})) {
    if (!names.has(key)) fail(key);
  }
  const scenarios = definition.scenarios ?? [];
  const scenarioIds = new Set<string>();
  for (const scenario of scenarios) {
    text(scenario.id, "scenario id");
    text(scenario.label, scenario.id);
    if (scenarioIds.has(scenario.id)) fail(scenario.id);
    scenarioIds.add(scenario.id);
  }
  const defaultScenario = scenarios.find((scenario) => scenario.id === "default") ?? {
    id: "default",
    label: en.sample.default,
    values: {},
  };
  const meta: GalleryMeta = {
    id: definition.id ?? tag,
    tag,
    title: copy.title,
    description: copy.description,
    category: definition.category ?? "components",
    controls,
    slots,
    scenarios: [defaultScenario, ...scenarios.filter((scenario) => scenario.id !== "default")],
    api,
  };
  for (const control of controls) {
    try {
      resolveValues(
        { ...meta, controls: [control], scenarios: [{ ...defaultScenario, values: {} }] },
        "default",
        {},
      );
    } catch (error) {
      fail(control.key, (error as Error).message);
    }
  }
  for (const scenario of meta.scenarios) {
    try {
      resolveValues(meta, scenario.id, {});
    } catch (error) {
      fail(`scenario ${scenario.id}`, (error as Error).message);
    }
  }
  return {
    meta,
    covers: definition.covers ?? [tag],
    ...(definition.interaction ? { interaction: definition.interaction } : {}),
    load: definition.load,
  };
}

export function observe(emit: (event: GalleryEvent) => void) {
  return (event: Event) =>
    emit({
      kind: "event",
      name: event.type,
      timestamp: Date.now(),
      args:
        "detail" in event
          ? JSON.parse(
              JSON.stringify(event.detail ?? null, (_key, value) =>
                typeof value === "function" ? "[callback]" : value,
              ),
            )
          : null,
    });
}

/** Controlled selectors report a value; the example owns the public value property. */
export function valueChanged(emit: (event: GalleryEvent) => void) {
  const report = observe(emit);
  return (event: CustomEvent<{ value: unknown }>) => {
    report(event);
    Object.assign(event.currentTarget!, { value: event.detail.value });
  };
}

export function localizeCallback(
  env: GalleryEnvironment,
  emit: (event: GalleryEvent) => void,
  prefix: "component.knx.config_panel.entities.create.light.knx",
) {
  return (key: string) => {
    const result =
      env.hass.localize(`${prefix}.${key}`) ||
      env.hass.localize(`component.knx.config_panel.entities.create._.knx.${key}`) ||
      (key.endsWith("description") ? en.sample.helper : en.sample.header);
    emit({ kind: "callback", name: "localize", timestamp: Date.now(), args: { key, result } });
    return result;
  };
}

/** Shape consumed by the group-address selector, including the form's nested field. */
export function validateGroupAddressConfig(value: unknown): string | undefined {
  return isRecord(value) &&
    ["write", "state"].every(
      (key) => value[key] === undefined || value[key] === null || typeof value[key] === "string",
    ) &&
    (value.dpt === undefined || typeof value.dpt === "string") &&
    (value.passive === undefined ||
      (Array.isArray(value.passive) && value.passive.every((item) => typeof item === "string")))
    ? undefined
    : en.validation.invalidValue;
}
