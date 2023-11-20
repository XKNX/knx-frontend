import { HomeAssistant } from "@ha/types";
import {
  KNXInfoData,
  TelegramDict,
  GroupMonitorInfoData,
  KNXProjectRespone,
} from "../types/websocket";
import {
  CreateEntityData,
  UpdateEntityData,
  LookupEntityData,
  EntityData,
} from "../types/entity_data";

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

export const deleteEntity = (hass: HomeAssistant, entityInfo: LookupEntityData) =>
  hass.callWS({
    type: "knx/delete_entity",
    ...entityInfo,
  });

export const getEntityData = (
  hass: HomeAssistant,
  entityInfo: LookupEntityData,
): Promise<EntityData> =>
  hass.callWS({
    type: "knx/get_entity_config",
    ...entityInfo,
  });
