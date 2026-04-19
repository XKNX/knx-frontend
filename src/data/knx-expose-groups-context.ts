import { createContext, ContextProvider } from "@lit/context";
import type { ReactiveElement } from "lit";

import type { HomeAssistant } from "@ha/types";

import { getExposeGroups } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-expose-groups-context");

export type ExposeGroups = Record<string, string[]>;

export interface ExposeGroupsContextValue {
  groups: ExposeGroups;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const contextKey = Symbol("knx-expose-groups-context");
export const exposeGroupsContext = createContext<ExposeGroupsContextValue | null>(contextKey);

/**
 * Lazy context provider for KNX expose groups data.
 * Automatically triggers loading when a consumer requests the context.
 *
 * The context value includes a `reload` callback so consumers can
 * trigger a refresh (e.g. after creating/deleting an expose).
 *
 * Consumers use `@consume({ context: exposeGroupsContext, subscribe: true })`
 * to receive reactive updates when data loads.
 */
export class KnxExposeGroupsContextProvider {
  private _provider: ContextProvider<typeof exposeGroupsContext>;

  private _loading = false;

  /** Whether any consumer has requested this context. This will not be unset on unsubscribe. */
  private _requested = false;

  private _hass?: HomeAssistant;

  private _reload = () => this._load();

  constructor(host: ReactiveElement) {
    // Listen for context-request BEFORE the ContextProvider to trigger lazy loading.
    host.addEventListener("context-request", this._onContextRequest as EventListener);
    this._provider = new ContextProvider(host, {
      context: exposeGroupsContext,
      initialValue: null,
    });
  }

  /**
   * Update connection info. Call after _initKnx.
   *
   * Loading is deferred until the first consumer requests the context.
   */
  public update(hass: HomeAssistant): void {
    this._hass = hass;
    // Load if a consumer already requested and we haven't loaded yet
    if (this._requested && !this._provider.value && !this._loading) {
      this._load();
    }
  }

  private _onContextRequest = (ev: Event): void => {
    const contextEvent = ev as Event & { context: unknown };
    if (contextEvent.context !== exposeGroupsContext) return;
    this._requested = true;
    // Trigger lazy loading if not yet loaded
    if (!this._provider.value && !this._loading && this._hass) {
      this._load();
    }
  };

  private async _load(): Promise<void> {
    if (!this._hass) return;
    this._loading = true;
    this._provider.setValue({
      groups: this._provider.value?.groups ?? {},
      loading: true,
      error: null,
      reload: this._reload,
    });
    logger.debug("Loading KNX expose groups from backend...");
    try {
      throw new Error("Simulated error loading expose groups");
      const exposeGroups = await getExposeGroups(this._hass);
      logger.debug(`Fetched ${Object.keys(exposeGroups).length} expose entities.`);
      this._provider.setValue({
        groups: exposeGroups,
        loading: false,
        error: null,
        reload: this._reload,
      });
    } catch (err) {
      logger.error("getExposeGroups", err);
      this._provider.setValue({
        groups: this._provider.value?.groups ?? {},
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        reload: this._reload,
      });
    } finally {
      this._loading = false;
    }
  }
}
