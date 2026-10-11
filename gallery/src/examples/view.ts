/* eslint-disable lit/binding-positions, lit/no-invalid-html -- lit/static-html supports these catalog-owned tag names. */
import { html, unsafeStatic } from "lit/static-html";
import { ref } from "lit/directives/ref";
import type { LitElement } from "lit";
import { ContextProvider } from "@lit/context";
import { labelsContext } from "@ha/data/context";
import { currentPath } from "@ha/common/url/current-path";
import { navigate } from "@ha/common/navigate";
import { isNavigationClick } from "@ha/common/dom/is-navigation-click";
import { entitiesByGroupContext } from "../../../src/data/knx-entities-by-group-context";
import type { GalleryExample } from "../types";
import type { KNXProject } from "../../../src/types/websocket";
import { prepareViews, type ViewFixtureOptions } from "../fixtures/views";
import { galleryUrl } from "../paths";
import en from "../localize/en.json";

export interface ViewScenarioOptions {
  path?: string;
  fixtures?: ViewFixtureOptions;
  projectContext?: KNXProject | null;
  entityGroupsError?: string;
  paused?: boolean;
}

export interface ViewExampleOptions {
  fixtures?: ViewFixtureOptions;
  scenarios?: Record<string, ViewScenarioOptions>;
  resetMonitorCache?: boolean;
}

/** The outer gallery is not the HA host. Mirror its route contract inside this iframe. */
export async function viewExample(
  tag: string,
  initialPath: string,
  options: ViewExampleOptions = {},
): Promise<GalleryExample> {
  // Only interactive examples need the application router for subsequent navigation.
  const thumbnail = new URLSearchParams(location.search).has("thumbnail");
  if (!thumbnail) await import("../../../src/main");
  let path = initialPath;
  let scenario: ViewScenarioOptions = {};
  let fixtures: ViewFixtureOptions = {};
  let host: HTMLElement | undefined;
  let activeTag = tag;
  let paused = false;
  let report: Parameters<GalleryExample["render"]>[3] | undefined;
  let routeKey = "";
  let currentRoute = { prefix: "", path: "" };
  const route = () => {
    const key = `${activeTag}:${path}`;
    if (key === routeKey) return currentRoute;
    routeKey = key;
    const segments = path.split("/");
    if (activeTag === "knx-frontend") {
      currentRoute = { prefix: "/knx", path };
      return currentRoute;
    }
    const count = activeTag === "knx-create-entity" || activeTag === "knx-create-expose" ? 3 : 2;
    currentRoute = {
      prefix: `/knx${segments.slice(0, count).join("/")}`,
      path: segments.slice(count).length ? `/${segments.slice(count).join("/")}` : "",
    };
    return currentRoute;
  };
  return {
    async prepare(env, id) {
      scenario = options.scenarios?.[id] ?? {};
      fixtures = { ...options.fixtures, ...scenario.fixtures };
      if (options.resetMonitorCache) {
        localStorage.removeItem("knx-group-monitor-coverage");
        const cache =
          await import("../../../src/features/group-monitor/services/telegram-cache-service");
        await new cache.TelegramCacheService().clear();
      }
      const haHost = document.createElement("home-assistant");
      document.body.append(haHost);
      haHost.addEventListener(
        "hass-more-info",
        (event) =>
          report?.({
            kind: "event",
            name: event.type,
            timestamp: Date.now(),
            args: (event as CustomEvent).detail,
          }),
        { signal: env.signal },
      );
      env.signal.addEventListener("abort", () => haHost.remove(), { once: true });
      // Iframes share a joint browser history. A late peer can become its newest
      // entry, so route exits must use this pane's existing HA predecessor.
      const back = history.back;
      history.back = () => {
        const from = history.state?.from;
        if (
          history.state?.dialog ||
          typeof from !== "string" ||
          !/^\/knx\/(entities|expose)(\/view)?$/.test(from)
        ) {
          back.call(history);
          return;
        }
        const url = new URL(location.href);
        url.hash = from;
        history.replaceState(null, "", url);
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      };
      env.signal.addEventListener(
        "abort",
        () => {
          history.back = back;
        },
        { once: true },
      );
      path = scenario.path ?? initialPath;
      const startPath = path;
      const flow = /^\/(entities|expose)\/(create|edit)/.exec(path);
      if (flow) {
        history.replaceState(null, "", galleryUrl(`preview.html#/knx/${flow[1]}/view`));
        history.pushState(
          { from: `/knx/${flow[1]}/view` },
          "",
          galleryUrl(`preview.html#/knx${path}`),
        );
      } else {
        history.replaceState(
          { message: en.views.error },
          "",
          galleryUrl(`preview.html#/knx${path}`),
        );
      }
      await prepareViews(env, fixtures, thumbnail);
      const changed = () => {
        path = currentPath().replace(/^\/knx/, "") || "/dashboard";
        if (tag !== "knx-frontend" && path !== startPath) activeTag = "knx-frontend";
        if (host) ((host.getRootNode() as ShadowRoot).host as LitElement).requestUpdate();
      };
      window.addEventListener("location-changed", changed, { signal: env.signal });
      window.addEventListener("popstate", changed, { signal: env.signal });
    },
    render(env, _values, _slots, emit) {
      report = emit;
      const element = unsafeStatic(activeTag);
      const pause = async (el?: Element) => {
        if (!el || paused || !scenario.paused) return;
        paused = true;
        await (el as LitElement).updateComplete;
        const menu = el.shadowRoot?.querySelector("ha-icon-overflow-menu");
        if (!env.signal.aborted) {
          await menu?.items
            .find(
              (item) =>
                item.label === env.knx.localize("component.knx.config_panel.group_monitor.pause"),
            )
            ?.action();
        }
      };
      const attach = (el?: Element) => {
        if (!el || el === host) return;
        host = el as HTMLElement;
        env.fixtures.attach(host);
        new ContextProvider(host, { context: labelsContext, initialValue: [] });
        if (scenario.entityGroupsError) {
          new ContextProvider(host, {
            context: entitiesByGroupContext,
            initialValue: {
              groups: {},
              loading: false,
              error: scenario.entityGroupsError,
              reload: async () => undefined,
            },
          });
        }
      };
      const clicked = (event: MouseEvent) => {
        const href = isNavigationClick(event);
        if (!href || !new URL(href, location.href).pathname.startsWith("/knx")) return;
        event.preventDefault();
        void navigate(href);
      };
      const reload = async () => {
        emit({ kind: "event", name: "knx-reload", timestamp: Date.now(), args: null });
        ((host!.getRootNode() as ShadowRoot).host as LitElement).requestUpdate();
      };
      return html`<div ${ref(attach)} style="height:100vh;display:flex;flex-direction:column;min-height:0" @click=${clicked} @knx-reload=${reload}>
        <${element} ${ref(pause)} style="display:block;flex:1;min-height:0;height:100%" .hass=${env.hass} .knx=${activeTag === "knx-frontend" ? undefined : { ...env.knx }} .route=${route()} .narrow=${matchMedia("(max-width: 870px)").matches}></${element}>
      </div>`;
    },
  };
}
