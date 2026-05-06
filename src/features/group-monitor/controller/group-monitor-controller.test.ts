import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroupMonitorController } from "./group-monitor-controller";

describe("GroupMonitorController", () => {
  let controller: GroupMonitorController;
  let mockHost: any;

  beforeEach(() => {
    mockHost = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    };
    controller = new GroupMonitorController(mockHost);
  });

  it("should remove from distinct values when buffer overflows from incoming telegrams", () => {
    // Set a very small max size for testing
    (controller as any)._telegramBuffer.setMaxSize(2);

    const t1 = {
      timestamp: "2024-01-01T10:00:00.000Z",
      source: "1.1.1",
      destination: "1/1/1",
      telegramtype: "GroupValueWrite",
      direction: "Incoming",
      payload: [1],
      value: "On",
    } as any;

    const t2 = { ...t1, source: "1.1.2", timestamp: "2024-01-01T10:00:01.000Z" };
    const t3 = { ...t1, source: "1.1.3", timestamp: "2024-01-01T10:00:02.000Z" };

    (controller as any)._handleIncomingTelegram(t1);
    (controller as any)._handleIncomingTelegram(t2);

    let result = controller.getFilteredTelegramsAndDistinctValues();
    expect(result.distinctValues.source["1.1.1"]).toBeDefined();
    expect(result.distinctValues.source["1.1.2"]).toBeDefined();

    // This should evict t1
    (controller as any)._handleIncomingTelegram(t3);

    result = controller.getFilteredTelegramsAndDistinctValues();
    expect(result.distinctValues.source["1.1.1"]).toBeUndefined(); // t1 evicted
    expect(result.distinctValues.source["1.1.2"]).toBeDefined();
    expect(result.distinctValues.source["1.1.3"]).toBeDefined();
  });
});
