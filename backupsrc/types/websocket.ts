export interface KNXInfo {
  version: string;
  connected: boolean;
  current_address: string;
}

export interface KNXTelegram {
  destination_address: string;
  source_address: string;
  payload: string;
  type: string;
  direction: string;
  timestamp: Date;
}
