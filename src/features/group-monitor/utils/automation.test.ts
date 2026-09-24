import { describe, it, expect } from "vitest";
import { TelegramRow } from "../types/telegram-row";
import { buildAutomationFromTelegram } from "./automation";

describe("automation utilities", () => {
  const createTestTelegram = (overrides = {}) =>
    new TelegramRow({
      timestamp: "2026-09-05T12:00:00.000000Z",
      source: "1.1.1",
      source_name: "Living Room Switch",
      destination: "1/2/3",
      destination_name: "Ceiling Light",
      telegramtype: "GroupValueWrite",
      direction: "Incoming",
      payload: [1],
      dpt_main: 1,
      dpt_sub: 1,
      dpt_name: "switch",
      value: "On",
      unit: null,
      ...overrides,
    });

  describe("buildAutomationFromTelegram", () => {
    it("builds a single mode automation with a knx.telegram trigger for GroupValueWrite Incoming", () => {
      const telegram = createTestTelegram();
      const config = buildAutomationFromTelegram(telegram);

      expect(config.mode).toBe("single");
      expect(config.alias).toBe("KNX: 1/2/3 Ceiling Light");
      expect(config.description).toBe("");
      expect(config.conditions).toEqual([]);
      expect(config.actions).toEqual([]);

      expect(config.triggers).toHaveLength(1);
      const trigger = (config.triggers as any[])[0];
      expect(trigger.trigger).toBe("knx.telegram");
      expect(trigger.options.destination).toEqual(["1/2/3"]);
      expect(trigger.alias).toBeUndefined();
      expect(trigger.note).toBeUndefined();
      expect(trigger.options.group_value_read).toBe(false);
      expect(trigger.options.group_value_response).toBe(false);
      expect(trigger.options.outgoing).toBe(false);
      expect(trigger.options.group_value_write).toBeUndefined();
      expect(trigger.options.incoming).toBeUndefined();
      expect(trigger.options.type).toBeUndefined();
    });

    it("handles GroupValueRead Outgoing correctly when DPT is unknown and addresses have no names", () => {
      const telegram = createTestTelegram({
        telegramtype: "GroupValueRead",
        direction: "Outgoing",
        source_name: null,
        destination_name: null,
        dpt_main: null,
        dpt_sub: null,
        dpt_name: null,
        payload: null,
        value: null,
      });

      const config = buildAutomationFromTelegram(telegram);
      const trigger = (config.triggers as any[])[0];

      expect(config.alias).toBe("KNX: 1/2/3");
      expect(trigger.alias).toBeUndefined();
      expect(trigger.note).toBeUndefined();
      expect(trigger.trigger).toBe("knx.telegram");
      expect(trigger.options.group_value_write).toBe(false);
      expect(trigger.options.group_value_response).toBe(false);
      expect(trigger.options.incoming).toBe(false);
      expect(trigger.options.group_value_read).toBeUndefined();
      expect(trigger.options.type).toBeUndefined();
      expect(config.description).toBe("");
    });

    it("does not add a DPT decoder override", () => {
      const telegram = createTestTelegram({
        dpt_main: 1,
        dpt_sub: 1,
        payload: null,
        value: null,
      });

      const config = buildAutomationFromTelegram(telegram);
      const trigger = (config.triggers as any[])[0];

      expect(trigger.options.type).toBeUndefined();
      expect(trigger.note).toBeUndefined();
      expect(config.description).toBe("");
    });

    it("treats an unexpected direction as incoming", () => {
      const telegram = createTestTelegram({
        direction: "Unknown",
      });

      const config = buildAutomationFromTelegram(telegram);
      const trigger = (config.triggers as any[])[0];

      expect(trigger.options.outgoing).toBe(false);
      expect(trigger.options.incoming).toBeUndefined();
    });

    it("handles GroupValueResponse correctly", () => {
      const telegram = createTestTelegram({
        telegramtype: "GroupValueResponse",
      });

      const config = buildAutomationFromTelegram(telegram);
      const trigger = (config.triggers as any[])[0];

      expect(config.alias).toBe("KNX: 1/2/3 Ceiling Light");
      expect(trigger.options.group_value_write).toBe(false);
      expect(trigger.options.group_value_read).toBe(false);
      expect(trigger.options.group_value_response).toBeUndefined();
    });

    it("uses the destination name in the automation alias", () => {
      const telegram = createTestTelegram();
      const config = buildAutomationFromTelegram(telegram);
      const trigger = (config.triggers as any[])[0];

      expect(config.alias).toBe("KNX: 1/2/3 Ceiling Light");
      expect(config.description).toBe("");
      expect(trigger.alias).toBeUndefined();
      expect(trigger.note).toBeUndefined();
    });
  });
});
