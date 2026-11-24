import { ContextConsumer, ContextProvider, createContext } from "@lit/context";
import type { ReactiveElement } from "lit";

import { createExposesByGroupAddressMap } from "./exposes-by-group";
import { entitiesByGroupContext } from "./knx-entities-by-group-context";
import type { EntitiesByGroup, RelatedEntity } from "./knx-entities-by-group-context";
import { exposeGroupsContext } from "./knx-expose-groups-context";
import type { ExposeGroups } from "./knx-expose-groups-context";

/** The entity or expose being edited - its own group addresses are not reported as usage. */
export interface GroupAddressUsageOwner {
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
 * Merge entities and exposes by group address, leaving out the owner itself.
 *
 * Only an owner of the same kind is left out: an expose of a KNX entity's state to one of
 * that entity's own group addresses is a real second use.
 */
export const createGroupAddressUsageMap = (
  entitiesByGroup: EntitiesByGroup | undefined,
  exposeGroups: ExposeGroups | undefined,
  owner: GroupAddressUsageOwner,
): GroupAddressUsageMap => {
  const usage: GroupAddressUsageMap = Object.create(null);
  const getUsage = (groupAddress: string): GroupAddressUsage => {
    usage[groupAddress] ??= { entities: [], exposes: [] };
    return usage[groupAddress];
  };

  Object.entries(entitiesByGroup ?? {}).forEach(([groupAddress, entities]) => {
    const others =
      owner.type === "entity"
        ? entities.filter((entity) => entity.entity_id !== owner.entityId)
        : entities;
    if (others.length) {
      getUsage(groupAddress).entities = others;
    }
  });

  Object.entries(exposeGroups ? createExposesByGroupAddressMap(exposeGroups) : {}).forEach(
    ([groupAddress, exposes]) => {
      // an expose can send several of its options to the same group address
      const others = [...new Set(exposes)].filter(
        (entityId) => owner.type !== "expose" || entityId !== owner.entityId,
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
 * Provides group address usage to the group address selectors below an editor view,
 * so they can hint at addresses already used by another entity or expose.
 *
 * Selectors without this provider above them (eg. in the send dialog) show no hint.
 */
export class KnxGroupAddressUsageProvider {
  private _provider: ContextProvider<typeof groupAddressUsageContext>;

  private _owner: GroupAddressUsageOwner;

  private _entitiesByGroup?: EntitiesByGroup;

  private _exposeGroups?: ExposeGroups;

  constructor(host: ReactiveElement, owner: GroupAddressUsageOwner) {
    this._owner = owner;
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
  public setOwnerEntityId(entityId: string | undefined): void {
    if (entityId === this._owner.entityId) return;
    this._owner = { ...this._owner, entityId };
    this._update();
  }

  private _update(): void {
    this._provider.setValue(
      createGroupAddressUsageMap(this._entitiesByGroup, this._exposeGroups, this._owner),
    );
  }
}
