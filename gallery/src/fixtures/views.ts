import { ContextEvent } from "@lit/context";
import { exposeGroupsContext } from "../../../src/data/knx-expose-groups-context";
import type {
  CreateEntityData,
  CreateEntityResult,
  ExposeConfigData,
  ExposeResult,
  GASchema,
} from "../../../src/types/entity_data";
import type {
  KNXBaseData,
  KNXProject,
  TelegramQueryParameters,
} from "../../../src/types/websocket";
import type { GalleryEnvironment } from "../types";
import { createKnxFixtures } from "./knx";
import { createRegistries } from "./registries";
import { createTelegrams } from "./telegrams";
import en from "../localize/en.json";

export interface ViewFixtureOptions {
  project?: KNXProject | null;
  dptMetadata?: KNXBaseData["dpt_metadata"];
  emptyEntities?: boolean;
  emptyExposes?: boolean;
  emptyTelegrams?: boolean;
  enableMonitor?: boolean;
  streamTelegrams?: boolean;
  failCalls?: readonly (
    | "knx/get_entity_config"
    | "knx/get_expose_config"
    | "knx/group_monitor_info"
    | "knx/group_telegrams"
  )[];
  failEntityValidation?: boolean;
  failExposeValidation?: boolean;
  reloadExposeContext?: boolean;
}

/** Named responses mirror websocket.service.ts and the pinned HA registry/flow APIs. */
export async function prepareViews(
  env: GalleryEnvironment,
  options: ViewFixtureOptions,
  thumbnail: boolean,
): Promise<void> {
  const fixtures = createKnxFixtures();
  const outcomes = env.fixtures;
  outcomes.failReaders = new Set(options.failCalls ?? []);
  const fails = (type: NonNullable<ViewFixtureOptions["failCalls"]>[number]) =>
    options.failCalls?.includes(type);
  outcomes.prepare((data) => {
    if (options.project !== undefined) data.project = structuredClone(options.project);
    if (options.emptyEntities) {
      data.registry = [];
      data.entities = {};
    }
    if (options.emptyExposes) data.exposes = {};
    data.telegrams = options.emptyTelegrams
      ? []
      : createTelegrams().map((telegram) => ({ ...telegram, timestamp: new Date().toISOString() }));
  });
  env.knx.dptMetadata = structuredClone(options.dptMetadata ?? fixtures.base.dpt_metadata);
  env.mockWS("config_entries/subscribe", (_message, _hass, callback) => {
    callback?.([{ type: null, entry: fixtures.configEntry }]);
    return () => undefined;
  });
  env.mockWS("config/entity_registry/get", ({ entity_id }) => {
    const entry = outcomes.data.registry.find((item) => item.entity_id === entity_id);
    if (!entry) throw new Error(en.views.fetchError);
    return structuredClone(entry);
  });
  env.mockWS("knx/get_entity_config", ({ entity_id }) => {
    const entity = outcomes.data.entities[String(entity_id)];
    if (fails("knx/get_entity_config") || !entity) throw new Error(en.views.fetchError);
    return structuredClone(entity);
  });
  const invalid = {
    success: false as const,
    error_base: en.views.validationError,
    errors: [
      {
        path: ["knx", "ga_switch", "write"],
        code: "invalid_address",
        message: en.views.validationError,
      },
    ],
  };
  const validate = (message: CreateEntityData): CreateEntityResult => {
    const [group, field] =
      message.platform === "sensor"
        ? (["ga_sensor", "state"] as const)
        : (["ga_switch", "write"] as const);
    const address = (message.data?.knx?.[group] as GASchema | undefined)?.[field];
    return options.failEntityValidation || !address
      ? { ...invalid, errors: [{ ...invalid.errors[0], path: ["data", "knx", group, field] }] }
      : { success: true, entity_id: null };
  };
  env.mockWS("knx/validate_entity", validate);
  const saveEntity = (id: string, config: CreateEntityData) =>
    outcomes.commit((data) => {
      data.entities[id] = config;
      const device = Object.values(data.devices).find((entry) =>
        entry.identifiers.some(
          ([domain, identifier]) =>
            domain === "knx" && identifier === config.data.entity.device_info,
        ),
      );
      const previous =
        data.registry.find((entry) => entry.entity_id === id) ??
        createRegistries().entityRegistry[0];
      const entry = {
        ...previous,
        id,
        entity_id: id,
        unique_id: id,
        name: config.data.entity.name,
        platform: "knx",
        device_id: device?.id ?? null,
        area_id: device?.area_id ?? null,
        entity_category: config.data.entity.entity_category ?? null,
      };
      data.registry = [...data.registry.filter((item) => item.entity_id !== id), entry];
    });
  env.mockWS("knx/update_entity", (message): CreateEntityResult => {
    const result = validate(message);
    if (result.success) {
      if (!outcomes.data.entities[message.entity_id]) throw new Error(en.views.fetchError);
      saveEntity(message.entity_id, { platform: message.platform, data: message.data });
    }
    return result;
  });
  env.mockWS("knx/create_entity", (message): CreateEntityResult => {
    const result = validate(message);
    if (!result.success) return result;
    const stem = `${message.platform}.${
      message.data.entity.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || "gallery"
    }`;
    let id = stem;
    let index = 2;
    while (outcomes.data.registry.some((item) => item.entity_id === id)) id = `${stem}_${index++}`;
    saveEntity(id, { platform: message.platform, data: message.data });
    return { success: true, entity_id: id };
  });
  env.mockWS("knx/delete_entity", ({ entity_id }) => {
    if (!outcomes.data.entities[entity_id]) throw new Error(en.views.fetchError);
    outcomes.commit((data) => {
      delete data.entities[entity_id];
      delete data.exposes[entity_id];
      data.registry = data.registry.filter((entry) => entry.entity_id !== entity_id);
    });
    return null;
  });
  const validateExpose = ({ data }: { data: ExposeConfigData }): ExposeResult =>
    options.failExposeValidation ||
    !data.options.every((option) => option.ga.write && option.ga.dpt)
      ? { ...invalid, errors: [{ ...invalid.errors[0], path: ["options", "0", "ga", "write"] }] }
      : { success: true };
  env.mockWS("knx/validate_expose", validateExpose);
  env.mockWS("knx/update_expose", (message): ExposeResult => {
    const result = validateExpose(message);
    if (result.success) {
      outcomes.commit((data) => {
        data.exposes[message.entity_id] = message.data;
      });
    }
    return result;
  });
  env.mockWS("knx/delete_expose", ({ entity_id }) => {
    if (!outcomes.data.exposes[entity_id]) throw new Error(en.views.fetchError);
    outcomes.commit((data) => {
      delete data.exposes[entity_id];
    });
    return null;
  });
  env.mockWS("manifest/get", () => ({
    domain: "knx",
    name: "KNX",
    config_flow: true,
    integration_type: "hub",
  }));
  // Show a local completed HA flow; no live connection settings are requested.
  for (const endpoint of ["config/config_entries/options/flow", "config/config_entries/flow"]) {
    env.mockAPI(endpoint, (_hass, method) => {
      if (method !== "POST") throw new Error(en.views.fetchError);
      return {
        type: "abort",
        flow_id: "gallery-flow",
        handler: "knx",
        reason: "already_configured",
      };
    });
  }
  if (options.reloadExposeContext) {
    // The real context reload consumes the overridden endpoint before first render.
    const host = document.querySelector("knx-gallery-preview")!;
    const child = document.createElement("span");
    host.append(child);
    let reload: (() => Promise<void>) | undefined;
    child.dispatchEvent(
      new ContextEvent(exposeGroupsContext, child, (value) => {
        reload = value?.reload;
      }),
    );
    await reload?.();
    child.remove();
  }
  if (options.enableMonitor) {
    env.mockWS("knx/query_telegrams", (params: TelegramQueryParameters) => {
      const filtered = outcomes.data.telegrams.filter(
        (telegram) =>
          (!params.start_time || telegram.timestamp >= params.start_time) &&
          (!params.end_time || telegram.timestamp <= params.end_time) &&
          (!params.destinations?.length || params.destinations.includes(telegram.destination)),
      );
      return {
        telegrams: structuredClone(filtered),
        total_count: filtered.length,
        limit_reached: false,
      };
    });
    // Captures must not depend on how soon a CI worker reaches the screenshot.
    if (
      options.streamTelegrams &&
      !options.emptyTelegrams &&
      !fails("knx/group_monitor_info") &&
      !thumbnail
    ) {
      let count = 0;
      const timer = setInterval(() => {
        if (env.signal.aborted || !env.canProduce()) return;
        void env
          .produceTelegram(
            count++ % 2
              ? { address: "1/0/2", payload: 21.5 }
              : { address: "1/0/1", payload: count % 2 },
          )
          .catch(() => undefined);
      }, 1200);
      env.signal.addEventListener("abort", () => clearInterval(timer), { once: true });
    }
  }
  for (const type of options.failCalls ?? []) {
    env.mockWS(type, () => {
      throw new Error(en.views.fetchError);
    });
  }
}
