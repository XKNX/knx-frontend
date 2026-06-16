import { describe, it, expect } from "vitest";
import { TelegramRow } from "./telegram-row";
import type { TelegramDict } from "../../../types/websocket";

describe("TelegramRow", () => {
  const mockTelegram = (overrides: Partial<TelegramDict> = {}): TelegramDict => ({
    timestamp: "2024-01-01T10:00:00.000Z",
    source: "1.1.1",
    source_name: "Source",
    destination: "1/1/1",
    destination_name: "Dest",
    telegramtype: "GroupValueWrite",
    direction: "Incoming",
    payload: [1],
    dpt_main: 1,
    dpt_sub: 1,
    dpt_name: "1.001",
    value: "On",
    unit: null,
    ...overrides,
  });

  it("should create a TelegramRow from TelegramDict", () => {
    const row = new TelegramRow(mockTelegram());
    expect(row.sourceAddress).toBe("1.1.1");
    expect(row.value).toBe("On");
  });

  it("should use payload as fallback value", () => {
    const row = new TelegramRow(mockTelegram({ value: null as any }));
    expect(row.value).toBe("0x01"); // Payload [1] formatted as hex
  });

  it("should use 'GroupRead' for GroupValueRead telegrams with no value/payload", () => {
    const row = new TelegramRow(
      mockTelegram({
        value: null as any,
        payload: null as any,
        telegramtype: "GroupValueRead",
      }),
    );
    expect(row.value).toBe("GroupRead");
  });

  it("should use empty string as final fallback for value", () => {
    const row = new TelegramRow(
      mockTelegram({
        value: null as any,
        payload: null as any,
        telegramtype: "GroupValueWrite",
      }),
    );
    expect(row.value).toBe("");
  });
});
