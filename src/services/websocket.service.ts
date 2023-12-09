import { HomeAssistant } from "@ha/types";
import { ExtEntityRegistryEntry } from "@ha/data/entity_registry";
import {
  KNXInfoData,
  TelegramDict,
  GroupMonitorInfoData,
  KNXProjectRespone,
} from "../types/websocket";
import { CreateEntityData, UpdateEntityData } from "../types/entity_data";

export const getKnxInfoData = (hass: HomeAssistant): Promise<KNXInfoData> =>
  hass.callWS({
    type: "knx/info",
  });

export const processProjectFile = (
  hass: HomeAssistant,
  file_id: string,
  password: string,
): Promise<void> =>
  hass.callWS({
    type: "knx/project_file_process",
    file_id: file_id,
    password: password,
  });

export const removeProjectFile = (hass: HomeAssistant): Promise<void> =>
  hass.callWS({
    type: "knx/project_file_remove",
  });

export const getGroupMonitorInfo = (hass: HomeAssistant): Promise<GroupMonitorInfoData> =>
  hass.callWS({
    type: "knx/group_monitor_info",
  });

export const subscribeKnxTelegrams = (
  hass: HomeAssistant,
  callback: (telegram: TelegramDict) => void,
) =>
  hass.connection.subscribeMessage<TelegramDict>(callback, {
    type: "knx/subscribe_telegrams",
  });

export const getKnxProject = (hass: HomeAssistant): Promise<KNXProjectRespone> =>
  hass.callWS({
    type: "knx/get_knx_project",
  });

/**
 * Entity store calls.
 */

export const createEntity = (hass: HomeAssistant, entityData: CreateEntityData) =>
  hass.callWS({
    type: "knx/create_entity",
    ...entityData,
  });

export const updateEntity = (hass: HomeAssistant, entityData: UpdateEntityData) =>
  hass.callWS({
    type: "knx/update_entity",
    ...entityData,
  });

export const deleteEntity = (hass: HomeAssistant, entityId: string) =>
  hass.callWS({
    type: "knx/delete_entity",
    entity_id: entityId,
  });

export const getEntityConfig = (hass: HomeAssistant, entityId: string): Promise<UpdateEntityData> =>
  hass.callWS({
    type: "knx/get_entity_config",
    entity_id: entityId,
  });

export const getEntityEntries = (hass: HomeAssistant): Promise<ExtEntityRegistryEntry[]> =>
  hass.callWS({
    type: "knx/get_entity_entries",
  });
