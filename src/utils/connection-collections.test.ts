import type { Connection } from "home-assistant-js-websocket";
import { afterEach, describe, expect, it } from "vitest";

import {
  dropDeadConnectionCollections,
  releaseConnectionCollectionsOnUnload,
} from "./connection-collections";

/** Minimal stand-in for a `getCollection()` result, built in the given realm. */
const createCollection = (realm: Window & typeof globalThis) => {
  const collection = new realm.Object() as Record<string, unknown>;
  collection.subscribe = new realm.Function("return () => {}")();
  collection.refresh = new realm.Function("return () => Promise.resolve()")();
  return collection;
};

const foreignRealms: HTMLIFrameElement[] = [];

/** An iframe realm that is not an ancestor of the test window. */
const createForeignRealm = (): Window & typeof globalThis => {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  foreignRealms.push(frame);
  return frame.contentWindow as Window & typeof globalThis;
};

const createConnection = (entries: Record<string, unknown>) => entries as unknown as Connection;

afterEach(() => {
  foreignRealms.splice(0).forEach((frame) => frame.remove());
});

describe("dropDeadConnectionCollections", () => {
  it("keeps collections created by this realm", () => {
    const connection = createConnection({ _entityRegistry: createCollection(window) });

    dropDeadConnectionCollections(connection);

    expect("_entityRegistry" in connection).toBe(true);
  });

  it("drops collections created by another realm", () => {
    const connection = createConnection({
      _entityRegistry: createCollection(createForeignRealm()),
      _labelRegistry: createCollection(window),
    });

    dropDeadConnectionCollections(connection);

    expect("_entityRegistry" in connection).toBe(false);
    expect("_labelRegistry" in connection).toBe(true);
  });

  it("ignores connection properties that are not collections", () => {
    const connection = createConnection({
      socket: {},
      options: { auth: "token" },
      _handleMessage: () => undefined,
    });

    dropDeadConnectionCollections(connection);

    expect(Object.keys(connection)).toEqual(["socket", "options", "_handleMessage"]);
  });
});

describe("releaseConnectionCollectionsOnUnload", () => {
  it("does not register a listener when not embedded in an iframe", () => {
    // `window.parent === window` in the test environment
    const connection = createConnection({ _entityRegistry: createCollection(window) });

    releaseConnectionCollectionsOnUnload(connection);
    window.dispatchEvent(new Event("pagehide"));

    expect("_entityRegistry" in connection).toBe(true);
  });
});
