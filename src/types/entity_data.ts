export type entityCategory = "config" | "diagnostic";

export type supportedPlatform = "switch";

type groupAddresses = string | string[];

interface BaseEntityData {
  device_id: string | null;
  entity_category: entityCategory | null;
  name: string;
  sync_state: string | boolean;
}

export interface SwitchEntityData extends BaseEntityData {
  device_class: "outlet" | "switch" | null; // TODO: maybe load from core
  invert: boolean;
  respond_to_read: boolean;
  switch_address: groupAddresses;
  switch_state_address: groupAddresses | null;
}

export type EntityData = SwitchEntityData;

export interface CreateEntityData {
  platform: supportedPlatform;
  data: EntityData;
}

export interface UpdateEntityData extends CreateEntityData {
  unique_id: string;
}

export interface LookupEntityData {
  platform: supportedPlatform;
  unique_id: string;
}
