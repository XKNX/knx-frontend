import type { HASSDomEvent as UpstreamHASSDomEvent } from "@ha/common/dom/fire_event";

declare global {
  // homeassistant-frontend 20261028.5 uses `HASSDomEvent` in the global
  // `HTMLElementEventMap` augmentation of `src/panels/lovelace/hui-root.ts` without
  // importing it, which fails `lint:types` here. Upstream `dev` imports it since
  // home-assistant/frontend#55565 - drop this once a release carries that.
  type HASSDomEvent<T> = UpstreamHASSDomEvent<T>;
}
