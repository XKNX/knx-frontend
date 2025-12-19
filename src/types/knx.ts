import type { ConfigEntry } from "@ha/data/config_entries";
import type { SupportedPlatform } from "./entity_data";
import type { SelectorSchema } from "./schema";
import type { DPTMetadata, KNXInfoData, KNXProjectInfo, KNXProject } from "./websocket";

export interface KNX {
  language: string;
  config_entry: ConfigEntry;
  localize(string: string, replace?: Record<string, any>): string;
  log: any;
  connectionInfo: KNXInfoData;
  dptMetadata: Record<string, DPTMetadata>;
  projectInfo: KNXProjectInfo | null;
  supportedPlatforms: SupportedPlatform[];
  projectData: KNXProject | null;
  loadProject(): Promise<void>;
  schema: Partial<Record<SupportedPlatform, SelectorSchema[]>>;
  loadSchema(platform: string): Promise<void>;
}
