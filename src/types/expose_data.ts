import type { GASchema } from "./entity_data";

export type ExposeType = string;

export interface ExposeData {
  address: GASchema;
  type: ExposeType;
}

// #################
// Validation result
// #################

export interface ErrorDescription {
  path: string[] | null;
  error_message: string;
  error_class: string;
}

export type ExposeVerificationResult =
  | {
      success: true;
      expose_address: string;
    }
  | {
      success: false;
      error_base: string;
      errors: ErrorDescription[];
    };
