import { buildAutomationFromKnx, type KnxTelegramTriggerOptions } from "../../../utils/automation";
import type { TelegramRow } from "../types/telegram-row";

export function buildAutomationFromTelegram(telegram: TelegramRow) {
  const typeFilters = {
    GroupValueWrite: { group_value_read: false, group_value_response: false },
    GroupValueRead: { group_value_write: false, group_value_response: false },
    GroupValueResponse: { group_value_write: false, group_value_read: false },
  } satisfies Record<string, Partial<KnxTelegramTriggerOptions>>;

  return buildAutomationFromKnx({
    destination: telegram.destinationAddress,
    destinationName: telegram.destinationText ?? undefined,
    ...(typeFilters[telegram.type] ?? {}),
    ...(telegram.direction === "Outgoing" ? { incoming: false } : { outgoing: false }),
  });
}
