import memoize from "memoize-one";
import type {
  DPT,
  KNXProject,
  CommunicationObject,
  GroupAddress,
  DPTMetadata,
} from "../types/websocket";
import type { SelectorSchema, GroupSelectOption } from "../types/schema";

export const equalDPT = (dpt1: DPT, dpt2: DPT): boolean =>
  dpt1.main === dpt2.main && dpt1.sub === dpt2.sub;

export const isValidDPT = (testDPT: DPT, validDPTs: DPT[]): boolean =>
  // true if main and sub is equal to one validDPT or
  // if main is equal to one validDPT where sub is `null`
  validDPTs.some(
    (testValidDPT) =>
      testDPT.main === testValidDPT.main &&
      (testValidDPT.sub ? testDPT.sub === testValidDPT.sub : true),
  );

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

export const filterDuplicateDPTs = (dpts: DPT[]): DPT[] =>
  dpts.reduce(
    (acc, dpt) => (acc.some((resultDpt) => equalDPT(resultDpt, dpt)) ? acc : acc.concat([dpt])),
    [] as DPT[],
  );

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

export const validDPTsForSchema = memoize(
  (schema: SelectorSchema[], dptMetadata: Record<string, DPTMetadata>): DPT[] =>
    filterDuplicateDPTs(_validDPTsForSchema(schema, dptMetadata)),
);

export const dptToString = (dpt: DPT | null): string => {
  if (dpt == null) return "";
  return dpt.main + (dpt.sub != null ? "." + dpt.sub.toString().padStart(3, "0") : "");
};

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

export const compareDpt = (left: DPT, right: DPT): number => {
  if (left.main !== right.main) {
    return left.main - right.main;
  }
  const leftSub = left.sub ?? -1;
  const rightSub = right.sub ?? -1;
  return leftSub - rightSub;
};
