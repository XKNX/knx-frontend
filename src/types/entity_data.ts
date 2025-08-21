import type { SUPPORTED_PLATFORMS } from "../utils/common";

export type EntityCategory = "config" | "diagnostic";

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export interface GASchema {
  write?: string;
  state?: string;
  passive?: string[];
  dpt?: string;
}

export interface BaseEntityData {
  device_info: string | null;
  entity_category: EntityCategory | null;
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

export interface EntityData {
  entity: BaseEntityData;
  knx: KnxEntityData;
}

export interface CreateEntityData {
  platform: SupportedPlatform;
  data: EntityData;
}

export interface UpdateEntityData extends CreateEntityData {
  entity_id: string;
}

export interface DeviceCreateData {
  name: string;
  area_id?: string;
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
