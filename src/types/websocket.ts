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

export interface KNXProject {
  project_loaded: boolean;
  knxproject: {
    group_addresses: { [key: string]: GroupAddress};
    group_ranges: { [key: string]: GroupRange };  
  };
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
  address: number;
  project_uid: number;
  dpt: DPTType | null;
  communication_object_ids: string[]
  description: string;
  comment: string;
}

export interface DPTType {
  main: number
  sub: number | null;
}
