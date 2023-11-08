import { ConfigEntry } from "@ha/data/config_entries";

export interface KNX {
  language: string;
  config_entry: ConfigEntry;
  localize(string: string, replace?: Record<string, any>): string;
  log: any;
}
