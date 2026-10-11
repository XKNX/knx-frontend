import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.dialogs["knx-group-monitor-telegram-info-dialog"];
export const entry = defineExample({
  tag: "knx-group-monitor-telegram-info-dialog",
  copy,
  category: "dialogs",
  events: ["dialog-closed", "hass-automation-editor"],
  suppliedProperties: ["params"],
  interaction: { state: ["_params.telegram"] },
  async load() {
    const [{ dialogButton }, { createDialogTelegrams }, telegramRows] = await Promise.all([
      import("./dialog"),
      import("../fixtures/telegrams"),
      import("../../../src/features/group-monitor/types/telegram-row"),
      import("../../../src/features/group-monitor/dialogs/telegram-info-dialog"),
    ]);
    return {
      render: (env, _values, _slots, emit) => {
        const rows = createDialogTelegrams().map(
          (telegram) => new telegramRows.TelegramRow(telegram),
        );
        return dialogButton(env, emit, "knx-group-monitor-telegram-info-dialog", {
          knx: env.knx,
          narrow: matchMedia("(max-width: 870px)").matches,
          telegram: rows[0],
          filteredTelegrams: rows,
        });
      },
    };
  },
});
