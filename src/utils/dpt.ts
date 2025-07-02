import memoize from "memoize-one";
import type { DPT, KNXProject, CommunicationObject, GroupAddress } from "../types/websocket";
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

function _validDPTsForSchema(schema: (SelectorSchema | GroupSelectOption)[]): DPT[] {
  const result: DPT[] = [];
  schema.forEach((item) => {
    if (item.type === "knx_group_address") {
      if (item.options.validDPTs) {
        result.push(...item.options.validDPTs);
      } else if (item.options.dptSelect) {
        result.push(...item.options.dptSelect.map((dptOption) => dptOption.dpt));
      }
      return;
    }
    if ("schema" in item) {
      // Section or GroupSelect
      result.push(..._validDPTsForSchema(item.schema));
    }
  });
  return result;
}

export const validDPTsForSchema = memoize((schema: SelectorSchema[]): DPT[] =>
  filterDuplicateDPTs(_validDPTsForSchema(schema)),
);
