import memoize from "memoize-one";
import type {
  DPT,
  KNXProject,
  CommunicationObject,
  GroupAddress,
  DPTMetadata,
} from "../types/websocket";
import type { SelectorSchema, GroupSelectOption } from "../types/schema";

/** Checks whether two DPTs have the same main and sub number. */
export const equalDPT = (dpt1: DPT, dpt2: DPT): boolean =>
  dpt1.main === dpt2.main && dpt1.sub === dpt2.sub;

/**
 * Checks whether `testDPT` matches one of `validDPTs`: same main and sub, or same
 * main where the valid entry's sub is `null` (matching any sub).
 */
export const isValidDPT = (testDPT: DPT, validDPTs: DPT[]): boolean =>
  validDPTs.some(
    (testValidDPT) =>
      testDPT.main === testValidDPT.main &&
      (testValidDPT.sub ? testDPT.sub === testValidDPT.sub : true),
  );

/** Filters a project's group addresses down to those whose DPT is in `validDPTs`. */
export const filterValidGroupAddresses = (
  project: KNXProject,
  validDPTs: DPT[],
): Record<string, GroupAddress> =>
  Object.entries(project.group_addresses).reduce(
    (acc, [id, groupAddress]) => {
      if (groupAddress.dpt && isValidDPT(groupAddress.dpt, validDPTs)) {
        acc[id] = groupAddress;
      }
      return acc;
    },
    {} as Record<string, GroupAddress>,
  );

/** Filters a project's communication objects down to those linked to a valid group address. */
export const filterValidComObjects = (
  project: KNXProject,
  validDPTs: DPT[],
): Record<string, CommunicationObject> => {
  const validGroupAddresses = filterValidGroupAddresses(project, validDPTs);
  return Object.entries(project.communication_objects).reduce(
    (acc, [id, comObject]) => {
      if (comObject.group_address_links.some((gaLink) => gaLink in validGroupAddresses)) {
        acc[id] = comObject;
      }
      return acc;
    },
    {} as Record<string, CommunicationObject>,
  );
};

/** Removes duplicate DPTs (same main/sub) from a list, keeping the first occurrence. */
export const filterDuplicateDPTs = (dpts: DPT[]): DPT[] =>
  dpts.reduce(
    (acc, dpt) => (acc.some((resultDpt) => equalDPT(resultDpt, dpt)) ? acc : acc.concat([dpt])),
    [] as DPT[],
  );

/** Recursively collects the DPTs allowed by any `knx_group_address` selector in a schema. */
function _validDPTsForSchema(
  schema: (SelectorSchema | GroupSelectOption)[],
  dptMetadata: Record<string, DPTMetadata>,
): DPT[] {
  const result: DPT[] = [];
  schema.forEach((item) => {
    if (item.type === "knx_group_address") {
      if (item.options.validDPTs) {
        result.push(...item.options.validDPTs);
      } else if (item.options.dptSelect) {
        result.push(...item.options.dptSelect.map((dptOption) => dptOption.dpt));
      } else if (item.options.dptClasses) {
        result.push(
          ...Object.values(dptMetadata)
            .filter((dptMeta) => item.options.dptClasses!.includes(dptMeta.dpt_class))
            .map((dptMeta) => ({ main: dptMeta.main, sub: dptMeta.sub })),
        );
      }
      return;
    }
    if ("schema" in item) {
      // Section or GroupSelect
      result.push(..._validDPTsForSchema(item.schema, dptMetadata));
    }
  });
  return result;
}

/** Deduplicated list of DPTs a schema's group address selectors accept. */
export const validDPTsForSchema = memoize(
  (schema: SelectorSchema[], dptMetadata: Record<string, DPTMetadata>): DPT[] =>
    filterDuplicateDPTs(_validDPTsForSchema(schema, dptMetadata)),
);

/** Formats a DPT as "main.sub" (sub zero-padded to 3 digits), or "main" if sub is null. */
export const dptToString = (dpt: DPT | null): string => {
  if (dpt == null) return "";
  return dpt.main + (dpt.sub != null ? "." + dpt.sub.toString().padStart(3, "0") : "");
};

/** Parses a "main" or "main.sub" string into a DPT, or null if it isn't a valid DPT. */
export const stringToDpt = (raw: string): DPT | null => {
  if (!raw) return null;
  const parts = raw.trim().split(".");
  if (parts.length === 0 || parts.length > 2) {
    return null;
  }
  const main = Number.parseInt(parts[0], 10);
  if (Number.isNaN(main)) {
    return null;
  }
  if (parts.length === 1) {
    return { main, sub: null };
  }
  const sub = Number.parseInt(parts[1], 10);
  if (Number.isNaN(sub)) {
    return null;
  }
  return { main, sub };
};

/** Sort comparator for DPTs, ordering by main then sub number (null sub sorts first). */
export const compareDpt = (left: DPT, right: DPT): number => {
  if (left.main !== right.main) {
    return left.main - right.main;
  }
  const leftSub = left.sub ?? -1;
  const rightSub = right.sub ?? -1;
  return leftSub - rightSub;
};

/**
 * DPT 1.x, 2.x, and 3.x are packed into the APCI header instead of extra payload
 * bytes, so their effective payload length is always 0 regardless of what the
 * backend reports.
 */
export const isApciPackedDptMain = (main: number): boolean =>
  main === 1 || main === 2 || main === 3;

/** Checks whether a DPT's metadata reports one of the given `dpt_class` values. */
export const dptInClasses = (
  dpt: DPT,
  dptClasses: string[],
  dptMetadata: Record<string, DPTMetadata>,
): boolean => {
  const key = dptToString(dpt);
  const metadata = dptMetadata[key];
  if (!metadata) {
    return false;
  }
  return dptClasses.includes(metadata.dpt_class);
};
