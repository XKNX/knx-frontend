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
    expect(row.dptId).toBe("1.001");
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

  it.each([
    { name: "a write with a known DPT and no value", overrides: { value: null }, expected: true },
    {
      name: "a response with a known DPT and no value",
      overrides: { value: null, telegramtype: "GroupValueResponse" },
      expected: true,
    },
    { name: "a decoded telegram", overrides: {}, expected: false },
    {
      name: "a telegram without a known DPT",
      overrides: { value: null, dpt_main: null, dpt_sub: null, dpt_name: null },
      expected: false,
    },
    {
      name: "a read request",
      overrides: { value: null, payload: null, telegramtype: "GroupValueRead" },
      expected: false,
    },
    {
      name: "an undecrypted secure telegram",
      overrides: { value: null, payload: null, telegramtype: "SecureAPDU", data_secure: true },
      expected: false,
    },
  ] satisfies { name: string; overrides: Partial<TelegramDict>; expected: boolean }[])(
    "flags $name as undecoded: $expected",
    ({ overrides, expected }) => {
      expect(new TelegramRow(mockTelegram(overrides)).undecoded).toBe(expected);
    },
  );
});
