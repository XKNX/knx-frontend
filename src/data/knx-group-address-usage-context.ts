import { ContextConsumer, ContextProvider, createContext } from "@lit/context";
import type { ReactiveElement } from "lit";

import { createExposesByGroupAddressMap } from "./exposes-by-group";
import { entitiesByGroupContext } from "./knx-entities-by-group-context";
import type { EntitiesByGroup, RelatedEntity } from "./knx-entities-by-group-context";
import { exposeGroupsContext } from "./knx-expose-groups-context";
import type { ExposeGroups } from "./knx-expose-groups-context";

/** An entity or expose to leave out - eg. the one being edited, so it doesn't report itself. */
export interface GroupAddressUsageExclude {
  type: "entity" | "expose";
  /** undefined while creating a new entity */
  entityId?: string;
}

export interface GroupAddressUsage {
  entities: RelatedEntity[];
  /** entity ids of exposes sending to the group address */
  exposes: string[];
}

/** Other entities and exposes using a group address, by group address. */
export type GroupAddressUsageMap = Record<string, GroupAddressUsage>;

/**
 * Merge entities and exposes by group address, optionally leaving one of them out.
 *
 * Only the given kind is left out: an expose of a KNX entity's state to one of that
 * entity's own group addresses is a real second use.
 */
export const createGroupAddressUsageMap = (
  entitiesByGroup: EntitiesByGroup | undefined,
  exposeGroups: ExposeGroups | undefined,
  exclude?: GroupAddressUsageExclude,
): GroupAddressUsageMap => {
  const usage: GroupAddressUsageMap = Object.create(null);
  const getUsage = (groupAddress: string): GroupAddressUsage => {
    usage[groupAddress] ??= { entities: [], exposes: [] };
    return usage[groupAddress];
  };

  Object.entries(entitiesByGroup ?? {}).forEach(([groupAddress, entities]) => {
    const others =
      exclude?.type === "entity"
        ? entities.filter((entity) => entity.entity_id !== exclude.entityId)
        : entities;
    if (others.length) {
      getUsage(groupAddress).entities = others;
    }
  });

  Object.entries(exposeGroups ? createExposesByGroupAddressMap(exposeGroups) : {}).forEach(
    ([groupAddress, exposes]) => {
      // an expose can send several of its options to the same group address
      const others = [...new Set(exposes)].filter(
        (entityId) => exclude?.type !== "expose" || entityId !== exclude.entityId,
      );
      if (others.length) {
        getUsage(groupAddress).exposes = others;
      }
    },
  );

  return usage;
};

const contextKey = Symbol("knx-group-address-usage-context");
export const groupAddressUsageContext = createContext<GroupAddressUsageMap>(contextKey);

/**
 * Provides group address usage to the group address selectors below a view or dialog,
 * so they can show the entities and exposes using an address.
 *
 * Selectors without this provider above them (eg. in the time server dialog) show nothing.
 */
export class KnxGroupAddressUsageProvider {
  private _provider: ContextProvider<typeof groupAddressUsageContext>;

  private _exclude?: GroupAddressUsageExclude;

  private _entitiesByGroup?: EntitiesByGroup;

  private _exposeGroups?: ExposeGroups;

  constructor(host: ReactiveElement, exclude?: GroupAddressUsageExclude) {
    this._exclude = exclude;
    this._provider = new ContextProvider(host, {
      context: groupAddressUsageContext,
      initialValue: {},
    });
    new ContextConsumer(host, {
      context: entitiesByGroupContext,
      subscribe: true,
      callback: (value) => {
        if (value?.groups === this._entitiesByGroup) return;
        this._entitiesByGroup = value?.groups;
        this._update();
      },
    });
    new ContextConsumer(host, {
      context: exposeGroupsContext,
      subscribe: true,
      callback: (value) => {
        if (value?.groups === this._exposeGroups) return;
        this._exposeGroups = value?.groups;
        this._update();
      },
    });
  }

  /** Set the entity id of the entity or expose being edited. */
  public setExcludedEntityId(entityId: string | undefined): void {
    if (!this._exclude || entityId === this._exclude.entityId) return;
    this._exclude = { ...this._exclude, entityId };
    this._update();
  }

  private _update(): void {
    this._provider.setValue(
      createGroupAddressUsageMap(this._entitiesByGroup, this._exposeGroups, this._exclude),
    );
  }
}
