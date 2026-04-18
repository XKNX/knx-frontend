import { createContext, ContextProvider } from "@lit/context";
import type { ReactiveElement } from "lit";

import type { HomeAssistant } from "@ha/types";

import { getKnxProject } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";
import type { KNXProject } from "../types/websocket";

const logger = new KNXLogger("knx-project-context");

const contextKey = Symbol("knx-project-context");
export const knxProjectContext = createContext<KNXProject | null>(contextKey);

/**
 * Lazy context provider for KNX project data.
 * Automatically triggers loading when a consumer requests the context
 * and a project is available (`hasProject` is true).
 *
 * Consumers use `@consume({ context: knxProjectContext, subscribe: true })`
 * to receive reactive updates when project data loads.
 */
export class KnxProjectContextProvider {
  private _provider: ContextProvider<typeof knxProjectContext>;

  private _loading = false;

  private _hass?: HomeAssistant;

  private _hasProject = false;

  private _onLoad?: (value: KNXProject | null) => void;

  constructor(host: ReactiveElement, options?: { onLoad?: (value: KNXProject | null) => void }) {
    this._onLoad = options?.onLoad;
    // Listen for context-request BEFORE the ContextProvider to trigger lazy loading.
    host.addEventListener("context-request", this._onContextRequest as EventListener);
    this._provider = new ContextProvider(host, {
      context: knxProjectContext,
      initialValue: null,
    });
  }

  /** Update connection and project availability. Call after _initKnx. */
  public update(hass: HomeAssistant, hasProject: boolean): void {
    this._hass = hass;
    this._hasProject = hasProject;
  }

  private _onContextRequest = (ev: Event): void => {
    const contextEvent = ev as Event & { context: unknown };
    if (contextEvent.context !== knxProjectContext) return;
    // Trigger lazy loading if not yet loaded and project is available
    if (!this._provider.value && !this._loading && this._hasProject && this._hass) {
      this._load();
    }
  };

  private async _load(): Promise<void> {
    if (!this._hass) return;
    this._loading = true;
    try {
      const project = await getKnxProject(this._hass);
      this._provider.setValue(project);
      this._onLoad?.(project);
    } catch (err) {
      logger.error("getKnxProject", err);
    } finally {
      this._loading = false;
    }
  }
}
