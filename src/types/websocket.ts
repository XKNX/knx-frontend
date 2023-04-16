export interface KNXInfo {
  version: string;
  connected: boolean;
  current_address: string;
}

export interface GroupMonitorInfo {
  project_data: boolean;
}

export interface KNXTelegram {
  destination_address: string;
  destination_text: string;
  source_address: string;
  source_text: string;
  payload: string;
  type: string;
  direction: string;
  timestamp: Date;
  value: string;
}
