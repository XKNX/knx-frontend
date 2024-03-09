export type entityCategory = "config" | "diagnostic";

export type supportedPlatform = "switch";

export interface GASchema {
  write?: string;
  state?: string;
  passive?: string[];
  dpt?: string;
}

export interface BaseEntityData {
  device_info: string | null;
  entity_category: entityCategory | null;
  name: string;
}

export interface SwitchEntityData {
  entity: BaseEntityData;
  invert: boolean;
  respond_to_read: boolean;
  ga_switch: GASchema;
  sync_state: string | boolean;
}

export type KnxEntityData = SwitchEntityData;

export type EntityData = {
  entity: BaseEntityData;
  knx: KnxEntityData;
};

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

// #################
// Validation result
// #################

export interface ErrorDescription {
  path: string[] | null;
  error_message: string;
  error_class: string;
}

export type CreateEntityResult =
  | {
      success: true;
      entity_id: string | null;
    }
  | {
      success: false;
      error_base: string;
      errors: ErrorDescription[];
    };
