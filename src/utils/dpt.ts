import { DPT, KNXProject, CommunicationObject, GroupAddress } from "../types/websocket";

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
): { [id: string]: GroupAddress } =>
  Object.entries(project.group_addresses).reduce(
    (acc, [id, groupAddress]) => {
      if (groupAddress.dpt && isValidDPT(groupAddress.dpt, validDPTs)) {
        acc[id] = groupAddress;
      }
      return acc;
    },
    {} as { [id: string]: GroupAddress },
  );

export const filterValidComObjects = (
  project: KNXProject,
  validDPTs: DPT[],
): { [id: string]: ComunicationObject } => {
  const validGroupAddresses = filterValidGroupAddresses(project, validDPTs);
  return Object.entries(project.communication_objects).reduce(
    (acc, [id, comObject]) => {
      if (comObject.group_address_links.some((gaLink) => gaLink in validGroupAddresses)) {
        acc[id] = comObject;
      }
      return acc;
    },
    {} as { [id: string]: CommunicationObject },
  );
};
