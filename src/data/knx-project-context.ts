import { createContext, ContextProvider } from "@lit/context";
import type { ReactiveElement } from "lit";

import type { HomeAssistant } from "@ha/types";

import { getKnxProject } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";
import type { KNXProject, KNXProjectInfo } from "../types/websocket";

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

  /** Whether any consumer has requested this context. This will not be unset on unsubscribe. */
  private _requested = false;

  private _hass?: HomeAssistant;

  private _projectInfo: KNXProjectInfo | null = null;

  constructor(host: ReactiveElement) {
    // Listen for context-request BEFORE the ContextProvider to trigger lazy loading.
    host.addEventListener("context-request", this._onContextRequest as EventListener);
    this._provider = new ContextProvider(host, {
      context: knxProjectContext,
      initialValue: null,
    });
  }

  /**
   * Update connection and project availability. Call after _initKnx.
   *
   * Loading is deferred until the first consumer requests the context.
   * On subsequent calls, data is reloaded only if projectInfo changed and
   * a consumer has previously requested data (`_requested`) or data has
   * already been loaded (`_provider.value`).
   */
  public update(hass: HomeAssistant, projectInfo: KNXProjectInfo | null): void {
    this._hass = hass;
    if (!projectInfo) {
      this._projectInfo = null;
      this._loading = false;
      this._provider.setValue(null);
      return;
    }
    const changed =
      !this._projectInfo ||
      (Object.keys(projectInfo) as (keyof KNXProjectInfo)[]).some(
        (key) => projectInfo[key] !== this._projectInfo![key],
      );
    this._projectInfo = projectInfo;
    // Reload if project changed and data was previously loaded or requested.
    // If neither, loading is deferred to the first context-request.
    if (changed && (this._provider.value || this._requested)) {
      this._load();
    }
  }

  private _onContextRequest = (ev: Event): void => {
    const contextEvent = ev as Event & { context: unknown };
    if (contextEvent.context !== knxProjectContext) return;
    this._requested = true;
    // Trigger lazy loading if not yet loaded and project is available
    if (!this._provider.value && !this._loading && this._projectInfo && this._hass) {
      this._load();
    }
  };

  private async _load(): Promise<void> {
    if (!this._hass) return;
    this._loading = true;
    logger.debug("Loading KNX project data from backend...");
    try {
      const project = await getKnxProject(this._hass);
      this._provider.setValue(project);
    } catch (err) {
      logger.error("getKnxProject", err);
    } finally {
      this._loading = false;
    }
  }
}
