import { fireEvent } from "@ha/common/dom/fire_event";
import type { AutomationConfig } from "@ha/data/automation";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("automation");

export interface KnxTelegramTriggerOptions {
  destination: string[];
  group_value_write?: boolean;
  group_value_read?: boolean;
  group_value_response?: boolean;
  incoming?: boolean;
  outgoing?: boolean;
}

export interface KnxAutomationOptions extends Omit<KnxTelegramTriggerOptions, "destination"> {
  destination: string;
  destinationName?: string;
}

export function buildAutomationFromKnx({
  destination,
  destinationName,
  ...options
}: KnxAutomationOptions): Partial<AutomationConfig> {
  return {
    alias: `KNX: ${destination}${destinationName ? ` ${destinationName}` : ""}`,
    description: "",
    mode: "single",
    triggers: [
      {
        trigger: "knx.telegram",
        options: { destination: [destination], ...options },
      },
    ],
    conditions: [],
    actions: [],
  };
}

export function openAutomationEditor(data: Partial<AutomationConfig>, expanded = true): void {
  const customPanel = (window.parent as { customPanel?: HTMLElement }).customPanel;
  if (!customPanel) {
    logger.warn("Cannot open automation editor: parent custom panel not available");
    return;
  }
  fireEvent(customPanel, "hass-automation-editor", { data, expanded });
}
