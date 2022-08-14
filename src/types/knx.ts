import { ConfigEntry } from "../../homeassistant-frontend/src/data/config_entries";

export interface KNX {
  language: string;
  updates: any[];
  resources: any[];
  removed: any[];
  config_entry: ConfigEntry;
  sections: any;
  localize(string: string, replace?: Record<string, any>): string;
  log: any;
}
