import { DPT } from "../types/websocket";

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
