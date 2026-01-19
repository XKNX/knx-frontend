import type { Selector } from "@ha/data/selector";
import type { DPT } from "./websocket";

export type SelectorSchema =
  | Section
  | SectionFlat
  | GroupSelect
  | GASelector
  | SyncStateSelector
  | KnxHaSelector
  | Constant;

interface BaseSection {
  name: string;
  collapsible?: boolean;
}

export interface Section extends BaseSection {
  type: "knx_section";
  schema: SelectorSchema[];
}

export interface SectionFlat extends BaseSection {
  type: "knx_section_flat";
}

export interface GroupSelect extends BaseSection {
  type: "knx_group_select";
  schema: GroupSelectOption[];
  required?: boolean;
}

export interface GroupSelectOption {
  // no name key
  type: "knx_group_select_option";
  translation_key: string;
  schema: SelectorSchema[];
}

export interface SyncStateSelector {
  type: "knx_sync_state";
  name: string;
  allow_false?: boolean; // allow false to be sent to the state machine
}

export interface KnxHaSelector {
  type: "ha_selector";
  name: string;
  default?: any;
  required?: boolean; // for optional boolean selectors, there shall be no default value (can't get applied)
  selector: Selector;
}

export interface GASelector {
  name: string;
  type: "knx_group_address";
  label?: string;
  options: GASelectorOptions;
  required?: boolean; // if true, the group address is required to be set else voluptuous_serialize omits this and adds `optional`
}

export interface GASelectorOptions {
  write?: { required: boolean };
  state?: { required: boolean };
  passive?: boolean;
  validDPTs?: DPT[]; // one of validDPTs, dptSelect or dptClasses shall be set
  dptSelect?: DPTOption[];
  dptClasses?: string[];
}

export interface DPTOption {
  value: string;
  translation_key: string;
  dpt: DPT;
}

export interface Constant {
  type: "constant";
  value: string;
  name: string;
  required?: boolean;
}
