import type { ConfigEntry } from "@ha/data/config_entries";
import type { SupportedPlatform } from "./entity_data";
import type { SelectorSchema } from "./schema";
import type { KNXInfoData, KNXProjectResponse } from "./websocket";

export interface KNX {
  language: string;
  config_entry: ConfigEntry;
  localize(string: string, replace?: Record<string, any>): string;
  log: any;
  info: KNXInfoData;
  project: KNXProjectResponse | null;
  loadProject(): Promise<void>;
  schema: Partial<Record<SupportedPlatform, SelectorSchema[]>>;
  loadSchema(platform: string): Promise<void>;
}
