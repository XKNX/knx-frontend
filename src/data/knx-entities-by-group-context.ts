import { createContext, ContextProvider } from "@lit/context";
import type { ReactiveElement } from "lit";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";

import { computeDomain } from "@ha/common/entity/compute_domain";
import { subscribeEntityRegistry, type EntityRegistryEntry } from "@ha/data/entity/entity_registry";
import type { HomeAssistant } from "@ha/types";

import { getEntitiesByGroup } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";
import type { KNXEntityIdentifier } from "../types/websocket";

const logger = new KNXLogger("knx-entities-by-group-context");

type EntitiesByGroupIdentifiers = Record<string, KNXEntityIdentifier[]>;

export interface RelatedEntity {
  entity_id: string;
  /** UI entity (editable in the panel) or YAML entity */
  ui: boolean;
  /** disabled in the entity registry - has no state object */
  disabled: boolean;
}

/** Entities using a group address, UI entities first. */
export type EntitiesByGroup = Record<string, RelatedEntity[]>;

const compareRelatedEntities = (a: RelatedEntity, b: RelatedEntity): number =>
  Number(b.ui) - Number(a.ui) || a.entity_id.localeCompare(b.entity_id);

/**
 * Resolve the backend identifiers of each group address to entity ids.
 *
 * The backend only knows platform and unique_id; the entity registry maps these to
 * entity ids and accounts for renames. Identifiers without a registry entry are dropped.
 */
export const mapEntitiesByGroup = (
  entitiesByGroup: EntitiesByGroupIdentifiers,
  entityRegistry: EntityRegistryEntry[],
): EntitiesByGroup => {
  const entityIdsByIdentifier = new Map<string, string[]>();
  entityRegistry.forEach((entry) => {
    if (entry.platform !== "knx") {
      return;
    }
    const identifier = `${computeDomain(entry.entity_id)}:${entry.unique_id}`;
    entityIdsByIdentifier.set(identifier, [
      ...(entityIdsByIdentifier.get(identifier) ?? []),
      entry.entity_id,
    ]);
  });

  return Object.fromEntries(
    Object.entries(entitiesByGroup).map(([groupAddress, identifiers]) => {
      const byEntityId = new Map<string, RelatedEntity>();
      identifiers.forEach((identifier) => {
        entityIdsByIdentifier
          .get(`${identifier.platform}:${identifier.unique_id}`)
          ?.forEach((entityId) => {
            byEntityId.set(entityId, {
              entity_id: entityId,
              ui: identifier.ui,
              disabled: !!identifier.disabled,
            });
          });
      });
      return [groupAddress, [...byEntityId.values()].sort(compareRelatedEntities)];
    }),
  );
};

export interface EntitiesByGroupContextValue {
  groups: EntitiesByGroup;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const contextKey = Symbol("knx-entities-by-group-context");
export const entitiesByGroupContext = createContext<EntitiesByGroupContextValue | null>(contextKey);

/**
 * Lazy context provider for KNX entities-by-group data.
 * Automatically triggers loading when a consumer requests the context.
 */
export class KnxEntitiesByGroupContextProvider {
  private _provider: ContextProvider<typeof entitiesByGroupContext>;

  private _loading = false;

  /** Whether any consumer has requested this context. This will not be unset on unsubscribe. */
  private _requested = false;

  private _hass?: HomeAssistant;

  private _entitiesByGroupIdentifiers: EntitiesByGroupIdentifiers = {};

  private _entityRegistry: EntityRegistryEntry[] = [];

  private _entityRegistryUnsubscribe?: UnsubscribeFunc;

  private _entityRegistryConnection?: HomeAssistant["connection"];

  private _reload = () => this._load();

  constructor(host: ReactiveElement) {
    // Listen for context-request BEFORE the ContextProvider to trigger lazy loading.
    host.addEventListener("context-request", this._onContextRequest as EventListener);
    this._provider = new ContextProvider(host, {
      context: entitiesByGroupContext,
      initialValue: null,
    });
  }

  /**
   * Update connection info. Call after _initKnx.
   *
   * Loading is deferred until the first consumer requests the context.
   */
  public update(hass: HomeAssistant): void {
    this._hass = hass;
    this._ensureEntityRegistrySubscription();
    // Load if a consumer already requested and we haven't loaded yet
    if (this._requested && !this._provider.value && !this._loading) {
      this._load();
    }
  }

  private _onContextRequest = (ev: Event): void => {
    const contextEvent = ev as Event & { context: unknown };
    if (contextEvent.context !== entitiesByGroupContext) return;
    this._requested = true;
    this._ensureEntityRegistrySubscription();
    // Trigger lazy loading if not yet loaded
    if (!this._provider.value && !this._loading && this._hass) {
      this._load();
    }
  };

  private _ensureEntityRegistrySubscription(): void {
    if (!this._hass?.connection) {
      return;
    }

    if (
      this._entityRegistryUnsubscribe &&
      this._entityRegistryConnection === this._hass.connection
    ) {
      return;
    }

    this._entityRegistryUnsubscribe?.();
    this._entityRegistryConnection = this._hass.connection;
    this._entityRegistryUnsubscribe = subscribeEntityRegistry(this._hass.connection, (entities) => {
      this._entityRegistry = entities;
      if (!this._provider.value) {
        return;
      }
      this._provider.setValue({
        ...this._provider.value,
        groups: mapEntitiesByGroup(this._entitiesByGroupIdentifiers, this._entityRegistry),
      });
    });
  }

  private async _load(): Promise<void> {
    if (!this._hass) return;
    this._loading = true;
    this._provider.setValue({
      groups: this._provider.value?.groups ?? {},
      loading: true,
      error: null,
      reload: this._reload,
    });
    logger.debug("Loading KNX entities by group from backend...");
    try {
      const entitiesByGroup = await getEntitiesByGroup(this._hass);
      logger.debug(`Fetched entities for ${Object.keys(entitiesByGroup).length} group addresses.`);
      this._entitiesByGroupIdentifiers = entitiesByGroup;
      this._provider.setValue({
        groups: mapEntitiesByGroup(this._entitiesByGroupIdentifiers, this._entityRegistry),
        loading: false,
        error: null,
        reload: this._reload,
      });
    } catch (err) {
      logger.error("getEntitiesByGroup", err);
      this._provider.setValue({
        groups: this._provider.value?.groups ?? {},
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        reload: this._reload,
      });
    } finally {
      this._loading = false;
    }
  }
}
