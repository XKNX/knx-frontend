export interface KNXInfoData {
  version: string;
  connected: boolean;
  current_address: string;
  project: KNXProjectInfo | null;
}

export interface KNXProjectInfo {
  name: string;
  last_modified: string;
  tool_version: string;
  xknxproject_version: string;
}

export interface GroupMonitorInfoData {
  project_loaded: boolean;
  recent_telegrams: TelegramDict[];
}

// this has to match `TelegramDict` in the integrations `telegram.py`
export interface TelegramDict {
  destination: string;
  destination_name: string;
  direction: string;
  dpt_main: number | null;
  dpt_sub: number | null;
  dpt_name: string | null;
  source: string;
  source_name: string;
  payload: number | number[] | null;
  telegramtype: string;
  timestamp: string; // ISO 8601 eg. "2023-06-21T22:28:45.446257+02:00" from `dt_util.as_local(dt_util.utcnow())`
  unit: string | null;
  value: string | number | boolean | null;
}

export interface KNXProjectRespone {
  project_loaded: boolean;
  knxproject: KNXProject;
}

export interface KNXProject {
  info: KNXProjectInfo;
  group_addresses: { [key: string]: GroupAddress };
  group_ranges: { [key: string]: GroupRange };
  devices: { [key: string]: Device };
  communication_objects: { [key: string]: CommunicationObject };
}

export interface GroupRange {
  name: string;
  address_start: number;
  address_end: number;
  comment: string;
  group_addresses: string[];
  group_ranges: { [key: string]: GroupRange };
}

export interface GroupAddress {
  name: string;
  identifier: string;
  raw_address: number;
  address: string;
  project_uid: number;
  dpt: DPT | null;
  communication_object_ids: string[];
  description: string;
  comment: string;
}

export interface DPT {
  main: number;
  sub: number | null;
}

export interface Device {
  name: string;
  hardware_name: string;
  description: string;
  manufacturer_name: string;
  individual_address: string;
  application: string | null;
  project_uid: number | null;
  communication_object_ids: string[];
  channels: Record<string, Channel>; // id: Channel
}

export interface Channel {
  identifier: string;
  name: string;
}

export interface CommunicationObject {
  name: string;
  number: number;
  text: string;
  function_text: string;
  description: string;
  device_address: string;
  device_application: string | null;
  module: ModuleInstanceInfos | null;
  channel: string | null;
  dpts: DPT[];
  object_size: string;
  group_address_links: string[];
  flags: COFlags;
}

interface ModuleInstanceInfos {
  definition: string;
  root_number: number; // `Number` assigned by ComObject - without Module base object number added
}

interface COFlags {
  read: boolean;
  write: boolean;
  communication: boolean;
  transmit: boolean;
  update: boolean;
  readOnInit: boolean;
}
