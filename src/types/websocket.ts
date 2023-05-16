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
  recent_telegrams: KNXTelegram[];
}

export interface KNXTelegram {
  destination_address: string;
  destination_text: string;
  source_address: string;
  source_text: string;
  payload: string;
  type: string;
  direction: string;
  timestamp: string;
  value: string;
}
