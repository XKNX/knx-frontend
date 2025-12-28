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
  /**
   * Metadata of the imported ETS project.
   * Present whenever a project is available in the backend.
   * Use this to check project availability before loading full data.
   */
  projectInfo: KNXProjectInfo | null;
  supportedPlatforms: SupportedPlatform[];
  /**
   * Fully parsed KNX project content (group addresses, devices, etc.).
   * Initially null; populated only after calling `loadProject()`.
   * Prefer `projectInfo` to detect availability, then `await loadProject()` to access details.
   */
  projectData: KNXProject | null;
  /**
   * Loads full KNX project data into `projectData`.
   * First check `projectInfo` to ensure a project exists.
   * Call only if `projectData` is null or to reload the project.
   */
  loadProject(): Promise<void>;
  /**
   * Cache for platform schemas (selector definitions).
   * Once a platform schema has been loaded, it is stored here
   * and can be used as a lookup without loading it again.
   */
  schema: Partial<Record<SupportedPlatform, SelectorSchema[]>>;
  /**
   * Loads the schema for the given platform only if it is not
   * already present in the `schema` cache. Cached schemas are not reloaded.
   * Since schemas are provided by the backend, they can't change once loaded.
   */
  loadSchema(platform: string): Promise<void>;
}
