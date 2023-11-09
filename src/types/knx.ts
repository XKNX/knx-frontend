import { ConfigEntry } from "@ha/data/config_entries";
import { KNXProjectRespone } from "./websocket";

export interface KNX {
  language: string;
  config_entry: ConfigEntry;
  localize(string: string, replace?: Record<string, any>): string;
  log: any;
  project: KNXProjectRespone | null;
  loadProject(): Promise<void>;
}
