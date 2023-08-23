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

export const enum ConnectionType {
  Automatic = "automatic",
  RoutingPlain = "routing",
  RoutingSecure = "routing_secure",
  TunnellingUDP = "tunneling",
  TunnellingTCP = "tunneling_tcp",
  TunnellingSecure = "tunneling_tcp_secure",
}

export interface SettingsInfoData {
  config_entry: ConfigEntryData;
  local_interfaces: string[];
  keyfile_data: KeyfileData | null;
}

export type ConfigEntryData = ConnectionData & IntegrationSettingsData;

export interface ConnectionData {
  connection_type: ConnectionType;
  individual_address?: string;
  local_ip?: string | null; // not required
  multicast_group: string | null;
  multicast_port: number;
  route_back?: boolean | null; // not required
  host?: string | null; // only required for tunnelling
  port?: number | null; // only required for tunnelling
  tunnel_endpoint_ia?: string | null;
  // KNX secure
  user_id?: number | null; // not required
  user_password?: string | null; // not required
  device_authentication?: string | null; // not required
  knxkeys_filename?: string; // not required
  knxkeys_password?: string; // not required
  backbone_key?: string | null; // not required
  sync_latency_tolerance?: number | null; // not required
}

export interface IntegrationSettingsData {
  // OptionsFlow only
  state_updater: boolean;
  rate_limit?: number;
  //   Integration only (not forwarded to xknx)
  telegram_log_size?: number; // not required
}

export interface KeyfileData {
  project_name: string;
  timestamp: string;
  created_by: string;
  secure_backbone: SecureBackbone | null;
  tunnel_interfaces: TunnelInterface[];
  ds_group_addresses: string[]; // ["1/2/3"]
}

export interface SecureBackbone {
  multicast_address: string;
  latency: number;
}

export interface TunnelInterface {
  host: string; // "1.1.10"
  individual_address: string;
  user_id: number | null; // no user_id -> plain tunnelling
  ds_group_addresses: string[];
}

export interface GatewayDescriptor {
  name: string;
  ip_addr: string;
  port: number;
  individual_address: string; // todo convert
  local_interface: string;
  local_ip: string;
  supports_routing: boolean;
  supports_tunnelling: boolean;
  supports_tunnelling_tcp: boolean;
  supports_secure: boolean;
  core_version: number;
  routing_requires_secure: boolean; // todo unwrap
  tunnelling_requires_secure: boolean; // todo unwrap
  tunnelling_slots: TunnelingSlot[]; // todo flatten
}

interface TunnelingSlot {
  individual_address: string;
  authorized: boolean;
  free: boolean;
  usable: boolean;
}
