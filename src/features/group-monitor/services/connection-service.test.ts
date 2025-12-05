import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from "vitest";
import type { HomeAssistant } from "@ha/types";
import { ConnectionService } from "./connection-service";
import type { TelegramDict } from "../../../types/websocket";
import * as websocketService from "../../../services/websocket.service";

// Mock the websocket service
vi.mock("../../../services/websocket.service", () => ({
  subscribeKnxTelegrams: vi.fn(),
}));

// Mock the KNXLogger
vi.mock("../../../tools/knx-logger", () => ({
  KNXLogger: class {
    debug = vi.fn();

    warn = vi.fn();

    error = vi.fn();
  },
}));

/**
 * Helper function to create mock HomeAssistant object
 */
function createMockHass(): HomeAssistant {
  return {
    callWS: vi.fn(),
    connection: {
      subscribeMessage: vi.fn(),
    },
  } as any;
}

/**
 * Helper function to create mock telegram data
 */
function createMockTelegram(overrides: Partial<TelegramDict> = {}): TelegramDict {
  return {
    timestamp: "2024-01-01T10:00:00.000Z",
    source: "1.2.3",
    source_name: "Test Source",
    destination: "1/2/3",
    destination_name: "Test Light",
    telegramtype: "GroupValueWrite",
    direction: "Outgoing",
    payload: [1],
    dpt_main: 1,
    dpt_sub: 1,
    dpt_name: "1.001",
    unit: null,
    value: "On",
    ...overrides,
  };
}

describe("ConnectionService", () => {
  let service: ConnectionService;
  let mockHass: HomeAssistant;
  let mockSubscribeKnxTelegrams: Mock;

  beforeEach(() => {
    service = new ConnectionService();
    mockHass = createMockHass();
    mockSubscribeKnxTelegrams = vi.mocked(websocketService.subscribeKnxTelegrams);
    vi.clearAllMocks();
  });

  afterEach(() => {
    service.disconnect();
  });

  describe("Initial State", () => {
    it("should initialize with correct default state", () => {
      expect(service.isConnected).toBe(false);
      expect(service.connectionError).toBe(null);
    });
  });

  describe("Subscription Management", () => {
    it("should subscribe to telegrams successfully", async () => {
      const mockUnsubscribe = vi.fn();
      mockSubscribeKnxTelegrams.mockResolvedValue(mockUnsubscribe);

      await service.subscribe(mockHass);

      expect(mockSubscribeKnxTelegrams).toHaveBeenCalledWith(mockHass, expect.any(Function));
      expect(service.isConnected).toBe(true);
      expect(service.connectionError).toBe(null);
    });

    it("should handle subscription errors", async () => {
      const error = new Error("Connection failed");
      mockSubscribeKnxTelegrams.mockRejectedValue(error);

      await expect(service.subscribe(mockHass)).rejects.toThrow("Connection failed");

      expect(service.isConnected).toBe(false);
      expect(service.connectionError).toBe("Connection failed");
    });

    it("should handle non-Error subscription failures", async () => {
      const errorMessage = "String error";
      mockSubscribeKnxTelegrams.mockRejectedValue(errorMessage);

      await expect(service.subscribe(mockHass)).rejects.toBe(errorMessage);

      expect(service.isConnected).toBe(false);
      expect(service.connectionError).toBe("String error");
    });

    it("should not subscribe if already subscribed", async () => {
      const mockUnsubscribe = vi.fn();
      mockSubscribeKnxTelegrams.mockResolvedValue(mockUnsubscribe);

      // First subscription
      await service.subscribe(mockHass);
      expect(mockSubscribeKnxTelegrams).toHaveBeenCalledTimes(1);

      // Second subscription attempt
      await service.subscribe(mockHass);
      expect(mockSubscribeKnxTelegrams).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it("should unsubscribe properly", async () => {
      const mockUnsubscribe = vi.fn();
      mockSubscribeKnxTelegrams.mockResolvedValue(mockUnsubscribe);

      await service.subscribe(mockHass);
      expect(service.isConnected).toBe(true);

      service.unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(service.isConnected).toBe(false);
    });

    it("should handle unsubscribe when not subscribed", () => {
      expect(() => service.unsubscribe()).not.toThrow();
      expect(service.isConnected).toBe(false);
    });
  });

  describe("Telegram Handling", () => {
    it("should call telegram callback when telegram received", async () => {
      const mockUnsubscribe = vi.fn();
      const mockTelegram = createMockTelegram();
      const onTelegramCallback = vi.fn();

      let telegramHandler: (telegram: TelegramDict) => void;
      mockSubscribeKnxTelegrams.mockImplementation((_hass, callback) => {
        telegramHandler = callback;
        return Promise.resolve(mockUnsubscribe);
      });

      service.onTelegram(onTelegramCallback);
      await service.subscribe(mockHass);

      // Simulate receiving a telegram
      telegramHandler!(mockTelegram);

      expect(onTelegramCallback).toHaveBeenCalledWith(mockTelegram);
    });

    it("should handle telegram when no callback is set", async () => {
      const mockUnsubscribe = vi.fn();
      let telegramHandler: (telegram: TelegramDict) => void;

      mockSubscribeKnxTelegrams.mockImplementation((_hass, callback) => {
        telegramHandler = callback;
        return Promise.resolve(mockUnsubscribe);
      });

      await service.subscribe(mockHass);

      // Should not throw when no callback is set
      expect(() => telegramHandler!(createMockTelegram())).not.toThrow();
    });

    it("should update telegram callback", async () => {
      const mockUnsubscribe = vi.fn();
      const mockTelegram = createMockTelegram();
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();

      let telegramHandler: (telegram: TelegramDict) => void;
      mockSubscribeKnxTelegrams.mockImplementation((_hass, callback) => {
        telegramHandler = callback;
        return Promise.resolve(mockUnsubscribe);
      });

      service.onTelegram(firstCallback);
      await service.subscribe(mockHass);

      // Change callback
      service.onTelegram(secondCallback);

      // Simulate receiving a telegram
      telegramHandler!(mockTelegram);

      expect(firstCallback).not.toHaveBeenCalled();
      expect(secondCallback).toHaveBeenCalledWith(mockTelegram);
    });
  });

  describe("Connection State Callbacks", () => {
    it("should notify connection change on successful subscription", async () => {
      const mockUnsubscribe = vi.fn();
      const onConnectionChange = vi.fn();

      mockSubscribeKnxTelegrams.mockResolvedValue(mockUnsubscribe);
      service.onConnectionChange(onConnectionChange);

      await service.subscribe(mockHass);

      expect(onConnectionChange).toHaveBeenCalledWith(true, undefined);
    });

    it("should notify connection change on subscription error", async () => {
      const error = new Error("Connection failed");
      const onConnectionChange = vi.fn();

      mockSubscribeKnxTelegrams.mockRejectedValue(error);
      service.onConnectionChange(onConnectionChange);

      await expect(service.subscribe(mockHass)).rejects.toThrow();

      expect(onConnectionChange).toHaveBeenCalledWith(false, "Connection failed");
    });

    it("should notify connection change on unsubscribe", async () => {
      const mockUnsubscribe = vi.fn();
      const onConnectionChange = vi.fn();

      mockSubscribeKnxTelegrams.mockResolvedValue(mockUnsubscribe);
      service.onConnectionChange(onConnectionChange);

      await service.subscribe(mockHass);
      onConnectionChange.mockClear();

      service.unsubscribe();

      expect(onConnectionChange).toHaveBeenCalledWith(false, undefined);
    });

    it("should handle connection change when no callback is set", async () => {
      const mockUnsubscribe = vi.fn();
      mockSubscribeKnxTelegrams.mockResolvedValue(mockUnsubscribe);

      expect(async () => {
        await service.subscribe(mockHass);
        service.unsubscribe();
      }).not.toThrow();
    });
  });

  describe("Reconnection", () => {
    it("should reconnect successfully after error", async () => {
      const mockUnsubscribe = vi.fn();
      const onConnectionChange = vi.fn();

      service.onConnectionChange(onConnectionChange);

      // Initial failed connection
      mockSubscribeKnxTelegrams.mockRejectedValueOnce(new Error("Initial error"));
      await expect(service.subscribe(mockHass)).rejects.toThrow();

      expect(service.connectionError).toBe("Initial error");
      expect(onConnectionChange).toHaveBeenLastCalledWith(false, "Initial error");

      // Successful reconnection
      mockSubscribeKnxTelegrams.mockResolvedValueOnce(mockUnsubscribe);
      onConnectionChange.mockClear();

      await service.reconnect(mockHass);

      expect(service.connectionError).toBe(null);
      expect(service.isConnected).toBe(true);
      expect(onConnectionChange).toHaveBeenCalledWith(false, undefined); // Clear error state
      expect(onConnectionChange).toHaveBeenCalledWith(true, undefined); // Success state
    });

    it("should handle reconnection failure", async () => {
      const onConnectionChange = vi.fn();
      service.onConnectionChange(onConnectionChange);

      // Set initial error state
      mockSubscribeKnxTelegrams.mockRejectedValueOnce(new Error("Initial error"));
      await expect(service.subscribe(mockHass)).rejects.toThrow();

      // Failed reconnection
      mockSubscribeKnxTelegrams.mockRejectedValueOnce(new Error("Reconnection failed"));

      await expect(service.reconnect(mockHass)).rejects.toThrow("Reconnection failed");

      expect(service.connectionError).toBe("Reconnection failed");
      expect(service.isConnected).toBe(false);
    });
  });

  describe("Error Management", () => {
    it("should clear error state", async () => {
      const onConnectionChange = vi.fn();
      service.onConnectionChange(onConnectionChange);

      // Set error state
      mockSubscribeKnxTelegrams.mockRejectedValueOnce(new Error("Test error"));
      await expect(service.subscribe(mockHass)).rejects.toThrow();

      expect(service.connectionError).toBe("Test error");

      // Clear error
      onConnectionChange.mockClear();
      service.clearError();

      expect(service.connectionError).toBe(null);
      expect(onConnectionChange).toHaveBeenCalledWith(false, undefined); // Current connection state (false)
    });

    it("should clear error when connected", async () => {
      const mockUnsubscribe = vi.fn();
      const onConnectionChange = vi.fn();

      service.onConnectionChange(onConnectionChange);

      // Successful connection
      mockSubscribeKnxTelegrams.mockResolvedValue(mockUnsubscribe);
      await service.subscribe(mockHass);

      // Manually set error (shouldn't normally happen, but test the clear functionality)
      // @ts-expect-error - Testing internal property access
      service._connectionError = "Manual error";

      onConnectionChange.mockClear();
      service.clearError();

      expect(service.connectionError).toBe(null);
      expect(onConnectionChange).toHaveBeenCalledWith(true, undefined); // Current connection state (true)
    });
  });

  describe("Cleanup", () => {
    it("should disconnect and clean up all callbacks", async () => {
      const mockUnsubscribe = vi.fn();
      const onTelegramCallback = vi.fn();
      const onConnectionChange = vi.fn();

      mockSubscribeKnxTelegrams.mockResolvedValue(mockUnsubscribe);

      service.onTelegram(onTelegramCallback);
      service.onConnectionChange(onConnectionChange);

      await service.subscribe(mockHass);
      expect(service.isConnected).toBe(true);

      service.disconnect();

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(service.isConnected).toBe(false);

      // Callbacks should be cleared (we can't directly test this, but ensure no errors occur)
      expect(() => service.disconnect()).not.toThrow();
    });

    it("should handle disconnect when not connected", () => {
      const onTelegramCallback = vi.fn();
      const onConnectionChange = vi.fn();

      service.onTelegram(onTelegramCallback);
      service.onConnectionChange(onConnectionChange);

      expect(() => service.disconnect()).not.toThrow();
      expect(service.isConnected).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle multiple callbacks being set", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      service.onTelegram(callback1);
      service.onTelegram(callback2); // Should replace callback1

      service.onConnectionChange(callback1);
      service.onConnectionChange(callback2); // Should replace callback1

      expect(() => {
        // These calls shouldn't throw - the service should use the latest callbacks
        // @ts-expect-error - Testing internal method access
        service._notifyConnectionChange(true);
      }).not.toThrow();
    });

    it("should handle null callback functions", () => {
      expect(() => {
        service.onTelegram(null as any);
        service.onConnectionChange(null as any);
      }).not.toThrow();
    });
  });
});
