import type { KNXProjectInfo } from "../types/websocket";

/** Modification date of an ETS project, or `undefined` if missing or unparsable. */
export const parseProjectLastModified = (projectInfo: KNXProjectInfo): Date | undefined => {
  if (!projectInfo.last_modified) {
    return undefined;
  }
  const date = new Date(projectInfo.last_modified);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
