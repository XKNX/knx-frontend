import { ContextProvider } from "@lit/context";
import type { LitElement } from "lit";
import { fullEntitiesContext } from "@ha/data/context";
import type { MockHomeAssistant } from "@ha/fake_data/provide_hass";
import type { HomeAssistant } from "@ha/types";
import type { GroupMonitorController } from "../../../src/features/group-monitor/controller/group-monitor-controller";
import { knxProjectContext } from "../../../src/data/knx-project-context";
import { entitiesByGroupContext } from "../../../src/data/knx-entities-by-group-context";
import { exposeGroupsContext } from "../../../src/data/knx-expose-groups-context";
import type {
  CreateEntityData,
  ExposeConfigData,
  TimeServerData,
} from "../../../src/types/entity_data";
import type { KNXEntityIdentifier, KNXProject, TelegramDict } from "../../../src/types/websocket";
import type { GalleryEnvironment, GalleryValues } from "../types";
import { isJsonValue, isRecord } from "../state";
import { createKnxFixtures } from "./knx";
import { createRegistries } from "./registries";
import {
  createTelegrams,
  isTelegramHistory,
  mergeTelegramHistory,
  telegramAdditions,
} from "./telegrams";

interface FixtureData {
  project: KNXProject | null;
  entities: Record<string, CreateEntityData>;
  exposes: Record<string, ExposeConfigData>;
  registry: ReturnType<typeof createRegistries>["entityRegistry"];
  devices: HomeAssistant["devices"];
  time: TimeServerData;
  telegrams: TelegramDict[];
  monitor: TelegramDict[] | null;
}

export const initialEntity = (): CreateEntityData => ({
  platform: "light",
  data: {
    entity: { name: "Living room light", device_info: "1.1.1", entity_category: null },
    knx: { ga_switch: { write: "1/0/1" } },
  },
});

function initialData(): FixtureData {
  const fixtures = createKnxFixtures();
  const registry = createRegistries();
  return {
    project: fixtures.project,
    entities: { "light.living_room": initialEntity() },
    exposes: { "sensor.room_temperature": fixtures.expose },
    registry: registry.entityRegistry,
    devices: registry.devices,
    time: {},
    telegrams: createTelegrams(),
    monitor: null,
  };
}

const recordOf = (value: unknown, test: (item: Record<string, unknown>) => boolean) =>
  isRecord(value) && Object.values(value).every((item) => isRecord(item) && test(item));
const addressSchema = (value: Record<string, unknown>) =>
  ["write", "state", "dpt"].every(
    (key) => value[key] === undefined || value[key] === null || typeof value[key] === "string",
  ) &&
  (value.passive === undefined ||
    (Array.isArray(value.passive) &&
      value.passive.every((address) => typeof address === "string")));

/** Validate the entire snapshot before any local owner or provider changes. */
function validData(value: unknown): value is FixtureData {
  if (
    !isRecord(value) ||
    !isJsonValue(value) ||
    Object.keys(value).sort().join() !==
      "devices,entities,exposes,monitor,project,registry,telegrams,time"
  ) {
    return false;
  }
  return (
    (value.project === null ||
      (isRecord(value.project) &&
        isRecord(value.project.info) &&
        typeof value.project.info.name === "string" &&
        ["group_addresses", "group_ranges", "devices", "communication_objects"].every((key) =>
          isRecord(value.project![key]),
        ))) &&
    recordOf(
      value.entities,
      (entry) =>
        typeof entry.platform === "string" &&
        isRecord(entry.data) &&
        isRecord(entry.data.entity) &&
        typeof entry.data.entity.name === "string" &&
        isRecord(entry.data.knx),
    ) &&
    recordOf(
      value.exposes,
      (entry) =>
        (entry.notes === undefined || typeof entry.notes === "string") &&
        Array.isArray(entry.options) &&
        entry.options.every(
          (option) => isRecord(option) && isRecord(option.ga) && addressSchema(option.ga),
        ),
    ) &&
    recordOf(
      value.devices,
      (entry) =>
        typeof entry.id === "string" &&
        (entry.name === null || typeof entry.name === "string") &&
        Array.isArray(entry.identifiers) &&
        entry.identifiers.every(
          (id) =>
            Array.isArray(id) && id.length === 2 && id.every((part) => typeof part === "string"),
        ),
    ) &&
    Array.isArray(value.registry) &&
    value.registry.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.entity_id === "string" &&
        typeof entry.unique_id === "string" &&
        typeof entry.platform === "string",
    ) &&
    isRecord(value.time) &&
    recordOf(value.time, addressSchema) &&
    Object.keys(value.time).every((key) => ["time", "date", "datetime"].includes(key)) &&
    (value.monitor === null ||
      (Array.isArray(value.monitor) &&
        value.monitor.every(
          (row) =>
            isRecord(row) &&
            typeof row.timestamp === "string" &&
            typeof row.source === "string" &&
            typeof row.destination === "string",
        ))) &&
    isTelegramHistory(value.telegrams)
  );
}

/** One local data owner. Only its plain data crosses the existing PreviewSync boundary. */
export class FixtureOutcomes {
  public data = initialData();
  private _providers = new Map<HTMLElement, () => void>();
  private _version = 0;
  private _monitorVersion = 0;
  private _monitors = new WeakMap<Element, number>();
  private _root?: ParentNode;
  public failReaders = new Set<string>();
  private _readerVersions = new WeakMap<Element, number>();
  public constructor(
    private _env: GalleryEnvironment,
    private _changed: () => void,
  ) {}
  public capture = (): GalleryValues => {
    if (this._root) {
      const visit = (parent: ParentNode) => {
        for (const element of parent.children) {
          if (element.localName === "knx-group-monitor") {
            const controller = Reflect.get(element, "controller") as GroupMonitorController;
            if (!controller) continue;
            this.data.monitor = this.data.telegrams.filter((telegram) =>
              controller.telegrams.some(
                (row) =>
                  row.timestampIso === telegram.timestamp &&
                  row.sourceAddress === telegram.source &&
                  row.destinationAddress === telegram.destination,
              ),
            );
          }
          if (element.shadowRoot) visit(element.shadowRoot);
          visit(element);
        }
      };
      visit(this._root);
    }
    return JSON.parse(JSON.stringify(this.data));
  };
  public apply = (value: GalleryValues) => {
    if (this._env.signal.aborted || JSON.stringify(value) === JSON.stringify(this.data)) return;
    if (!validData(value)) throw new Error("Invalid gallery fixture outcome.");
    this._monitorVersion++;
    this._accept(value, false);
  };
  /** Hydrate accepted user outcomes directly, preserving local callbacks and pause state. */
  public receiveTelegrams(telegrams: unknown) {
    if (this._env.signal.aborted) return false;
    if (!isTelegramHistory(telegrams)) throw new Error("Invalid gallery telegram outcome.");
    const merged = mergeTelegramHistory(this.data.telegrams, telegrams);
    const additions = telegramAdditions(this.data.telegrams, telegrams);
    if (!additions.length) return false;
    this._accept({ ...this.data, telegrams: merged }, false);
    const visit = (parent: ParentNode) => {
      for (const element of parent.children) {
        if (element.localName === "knx-group-monitor") {
          const controller = Reflect.get(element, "controller") as
            GroupMonitorController | undefined;
          if (controller) {
            this._monitors.set(element, this._monitorVersion);
            if (!controller.isPaused) {
              controller.addHistoricalTelegrams(structuredClone(additions), false);
            }
          }
        }
        if (element.shadowRoot) visit(element.shadowRoot);
        visit(element);
      }
    };
    if (this._root) {
      visit(this._root);
      this.capture();
      this.refresh(this._root);
    }
    return true;
  }
  public commit(change: (data: FixtureData) => void) {
    const next = structuredClone(this.data);
    change(next);
    const plain: unknown = JSON.parse(JSON.stringify(next));
    if (!validData(plain)) throw new Error("Invalid gallery fixture outcome.");
    this._accept(plain, true);
  }
  /** Scenario preparation is local and cannot claim a writer or publish an outcome. */
  public prepare(change: (data: FixtureData) => void) {
    const next = initialData();
    change(next);
    this._accept(next, false);
  }
  private _accept(next: FixtureData, notify: boolean) {
    if (this._env.signal.aborted || JSON.stringify(next) === JSON.stringify(this.data)) return;
    this.data = structuredClone(next);
    this._version++;
    this._env.knx.projectInfo = this.data.project?.info ?? null;
    const originals = createRegistries();
    const entities: HomeAssistant["entities"] = {};
    const states: HomeAssistant["states"] = {};
    for (const entry of this.data.registry) {
      const name = entry.name ?? originals.entities[entry.entity_id]?.name ?? entry.entity_id;
      entities[entry.entity_id] = {
        entity_id: entry.entity_id,
        name,
        platform: entry.platform,
        device_id: entry.device_id ?? undefined,
        area_id: entry.area_id ?? undefined,
        labels: entry.labels,
      };
      const seed =
        originals.states[entry.entity_id] ??
        originals.states[
          entry.entity_id.startsWith("light.") ? "light.living_room" : "sensor.room_temperature"
        ];
      states[entry.entity_id] = {
        ...structuredClone(seed),
        entity_id: entry.entity_id,
        attributes: { ...seed.attributes, friendly_name: name },
      };
    }
    (this._env.hass as MockHomeAssistant).updateHass({
      entities,
      states,
      devices: structuredClone(this.data.devices),
    });
    this._providers.forEach((publish) => publish());
    if (notify) this._changed();
  }
  public get identifiers(): Record<string, KNXEntityIdentifier[]> {
    const groups: Record<string, KNXEntityIdentifier[]> = {};
    for (const [id, config] of Object.entries(this.data.entities)) {
      const entry = this.data.registry.find((item) => item.entity_id === id);
      if (!entry) continue;
      const visit = (value: unknown) => {
        if (!isRecord(value)) return;
        for (const [key, field] of Object.entries(value)) {
          if (["write", "state", "passive"].includes(key) && !isRecord(field)) {
            for (const address of Array.isArray(field) ? field : [field]) {
              if (typeof address === "string" && address) {
                const items = (groups[address] ??= []);
                if (!items.some((item) => item.unique_id === entry.unique_id)) {
                  items.push({ platform: config.platform, unique_id: entry.unique_id, ui: true });
                }
              }
            }
          } else visit(field);
        }
      };
      visit(config.data.knx);
    }
    return groups;
  }
  public get exposed() {
    return Object.fromEntries(
      Object.entries(this.data.exposes).map(([id, config]) => [
        id,
        config.options.flatMap((option) => (option.ga.write ? [option.ga.write] : [])),
      ]),
    );
  }
  public get latest() {
    return Object.fromEntries(
      this.data.telegrams.map((telegram) => [telegram.destination, telegram]),
    );
  }
  public attach(host: HTMLElement) {
    if (this._providers.has(host)) return;
    const project = new ContextProvider(host, {
      context: knxProjectContext,
      initialValue: this.data.project,
    });
    const full = new ContextProvider(host, {
      context: fullEntitiesContext,
      initialValue: this.data.registry,
    });
    const entities = new ContextProvider(host, {
      context: entitiesByGroupContext,
      initialValue: null,
    });
    const exposes = new ContextProvider(host, { context: exposeGroupsContext, initialValue: null });
    const reloadEntities = async () => {
      const identifiers = await this._env.hass.callWS<Record<string, KNXEntityIdentifier[]>>({
        type: "knx/get_entities_by_group",
      });
      publishEntities(identifiers);
    };
    const publishEntities = (identifiers = this.identifiers) =>
      entities.setValue({
        groups: Object.fromEntries(
          Object.entries(identifiers).map(([address, ids]) => [
            address,
            {
              ui: this.data.registry
                .filter((entry) => ids.some((id) => id.ui && id.unique_id === entry.unique_id))
                .map((entry) => entry.entity_id),
              yaml: this.data.registry
                .filter((entry) => ids.some((id) => !id.ui && id.unique_id === entry.unique_id))
                .map((entry) => entry.entity_id),
            },
          ]),
        ),
        loading: false,
        error: null,
        reload: reloadEntities,
      });
    const reloadExposes = async () =>
      exposes.setValue({
        groups: await this._env.hass.callWS({ type: "knx/get_expose_groups" }),
        loading: false,
        error: null,
        reload: reloadExposes,
      });
    const publish = () => {
      project.setValue(this.data.project);
      full.setValue(this.data.registry);
      publishEntities();
      exposes.setValue({
        groups: this.exposed,
        loading: false,
        error: null,
        reload: reloadExposes,
      });
    };
    this._providers.set(host, publish);
    publish();
  }
  public refresh = (root: ParentNode) => {
    if (this._env.signal.aborted) return;
    this._root = root;
    const visit = (parent: ParentNode) => {
      for (const element of parent.children) {
        if (
          element.localName === "knx-group-monitor" &&
          this.data.monitor !== null &&
          this._monitors.get(element) !== this._monitorVersion &&
          !this.failReaders.has("knx/group_monitor_info")
        ) {
          const controller = Reflect.get(element, "controller") as GroupMonitorController;
          if (!controller) continue;
          this._monitors.set(element, this._monitorVersion);
          const reload = controller.isReloadEnabled;
          controller.clearTelegrams();
          controller.addHistoricalTelegrams(structuredClone(this.data.monitor), false);
          Reflect.set(controller, "_isReloadEnabled", reload);
        }
        // The router is below product-owned lazy KNX and HA registry providers.
        if (element.localName === "knx-router") this.attach(element as HTMLElement);
        if (this._readerVersions.get(element) !== this._version) {
          if (element.localName === "knx-frontend" && Reflect.get(element, "knx")) {
            this._readerVersions.set(element, this._version);
            Reflect.set(element, "knx", {
              ...Reflect.get(element, "knx"),
              projectInfo: this.data.project?.info ?? null,
            });
          }
          if (
            element.localName === "knx-project-view" &&
            typeof Reflect.get(element, "requestUpdate") === "function" &&
            !this.failReaders.has("knx/group_telegrams")
          ) {
            this._readerVersions.set(element, this._version);
            Reflect.set(element, "_lastTelegrams", structuredClone(this.latest));
            (element as LitElement).requestUpdate();
          }
        }
        if (element.shadowRoot) visit(element.shadowRoot);
        visit(element);
      }
    };
    visit(root);
  };
}
