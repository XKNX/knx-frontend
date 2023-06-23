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

// TODO:
// - format timestamp
// - format / translate direction
// - use DPT
