import type { HomeAssistant } from "@ha/types";
import { subscribeKnxTelegrams } from "../../../services/websocket.service";
import { KNXLogger } from "../../../tools/knx-logger";
import type { TelegramDict } from "../../../types/websocket";

const logger = new KNXLogger("connection_service");

/**
 * Manages WebSocket connections for the Group Monitor
 * Handles subscribing to KNX telegrams, connection state, and errors.
 */
export class ConnectionService {
  private _subscribed?: () => void;

  private _connection: HomeAssistant["connection"] | null = null;

  private _connectionError: string | null = null;

  private _onTelegram: ((telegram: TelegramDict) => void) | null = null;

  private _onConnectionChange: ((connected: boolean, error?: string) => void) | null = null;

  private _onConnectionLost: (() => void) | null = null;

  private _onReconnected: (() => void) | null = null;

  private readonly _handleDisconnected = (): void => {
    logger.debug("Websocket connection lost");
    this._onConnectionLost?.();
  };

  private readonly _handleReady = (): void => {
    logger.debug("Websocket connection restored");
    this._onReconnected?.();
  };

  /**
   * Gets the current connection error if any
   */
  get connectionError(): string | null {
    return this._connectionError;
  }

  /**
   * Checks if currently subscribed to telegrams
   */
  get isConnected(): boolean {
    return !!this._subscribed;
  }

  /**
   * Sets the callback for incoming telegrams
   */
  onTelegram(callback: (telegram: TelegramDict) => void): void {
    this._onTelegram = callback;
  }

  /**
   * Sets the callback for connection state changes
   */
  onConnectionChange(callback: (connected: boolean, error?: string) => void): void {
    this._onConnectionChange = callback;
  }

  /**
   * Sets the callback for a dropped websocket connection. Telegrams sent while
   * it is down never arrive; the subscription itself is restored by the
   * connection, which then calls the `onReconnected` callback.
   */
  onConnectionLost(callback: () => void): void {
    this._onConnectionLost = callback;
  }

  /**
   * Sets the callback for a restored websocket connection
   */
  onReconnected(callback: () => void): void {
    this._onReconnected = callback;
  }

  /**
   * Subscribes to KNX telegrams
   */
  async subscribe(hass: HomeAssistant): Promise<void> {
    if (this._subscribed) {
      logger.warn("Already subscribed to telegrams");
      return;
    }

    try {
      this._subscribed = await subscribeKnxTelegrams(hass, (telegram) => {
        if (this._onTelegram) {
          this._onTelegram(telegram);
        }
      });

      this._watchConnection(hass.connection);
      this._connectionError = null;
      this._notifyConnectionChange(true);

      logger.debug("Successfully subscribed to telegrams");
    } catch (err) {
      logger.error("Failed to subscribe to telegrams", err);
      this._connectionError = err instanceof Error ? err.message : String(err);
      this._notifyConnectionChange(false, this._connectionError);
      throw err;
    }
  }

  /**
   * Unsubscribes from KNX telegrams
   */
  unsubscribe(): void {
    this._unwatchConnection();
    if (this._subscribed) {
      this._subscribed();
      this._subscribed = undefined;
      this._notifyConnectionChange(false);
      logger.debug("Unsubscribed from telegrams");
    }
  }

  /**
   * Attempts to reconnect after a connection error
   */
  async reconnect(hass: HomeAssistant): Promise<void> {
    this._connectionError = null;
    this._notifyConnectionChange(false); // Clear error state
    await this.subscribe(hass);
  }

  /**
   * Clears any connection errors
   */
  clearError(): void {
    this._connectionError = null;
    this._notifyConnectionChange(this.isConnected);
  }

  /**
   * Disconnects and cleans up all subscriptions
   */
  disconnect(): void {
    this.unsubscribe();
    this._onTelegram = null;
    this._onConnectionChange = null;
    this._onConnectionLost = null;
    this._onReconnected = null;
  }

  // The connection object may be missing in tests that pass a bare hass stub.
  private _watchConnection(connection: HomeAssistant["connection"] | undefined): void {
    this._unwatchConnection();
    if (!connection?.addEventListener) return;
    connection.addEventListener("disconnected", this._handleDisconnected);
    connection.addEventListener("ready", this._handleReady);
    this._connection = connection;
  }

  private _unwatchConnection(): void {
    if (this._connection === null) return;
    this._connection.removeEventListener("disconnected", this._handleDisconnected);
    this._connection.removeEventListener("ready", this._handleReady);
    this._connection = null;
  }

  /**
   * Notifies about connection state changes
   */
  private _notifyConnectionChange(connected: boolean, error?: string): void {
    if (this._onConnectionChange) {
      this._onConnectionChange(connected, error);
    }
  }
}
