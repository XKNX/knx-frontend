export type entityCategory = "config" | "diagnostic";

export type supportedPlatform = "switch";

type groupAddresses = string | string[];

export interface BaseEntityData {
  device_info: string | null;
  entity_category: entityCategory | null;
  name: string;
}

export interface SwitchEntityData {
  entity: BaseEntityData;
  invert: boolean;
  respond_to_read: boolean;
  switch_address: groupAddresses;
  switch_state_address: groupAddresses | null;
  sync_state: string | boolean;
}

export type EntityData = SwitchEntityData;

export interface CreateEntityData {
  platform: supportedPlatform;
  data: EntityData;
}

export interface UpdateEntityData extends CreateEntityData {
  unique_id: string;
}

export interface EditEntityData extends UpdateEntityData {
  schema_options: SchemaOptions | null;
}

export interface DeviceCreateData {
  name: string;
  area_id?: string;
}

export interface SchemaOptions {
  entity?: EntitySchemaOptions;
}

export interface EntitySchemaOptions {
  // nothing yet
}
