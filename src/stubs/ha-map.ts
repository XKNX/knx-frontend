// Stub for HA's <ha-map> and <ha-locations-editor> — see build-scripts/stubs.cjs.
//
// These two components are the only modules in the tree that reach leaflet, leaflet-draw,
// leaflet.markercluster and maplibre-gl; nothing else imports them for anything but types.
// The KNX panel has no map to draw, so replacing the pair drops all four libraries.
//
// The elements still register, so a template that renders one gets an empty box and a
// console warning instead of an unknown tag that silently does nothing.

import { reportStubbed } from "./stub-report";

class StubbedMapElement extends HTMLElement {
  public connectedCallback(): void {
    reportStubbed("maps", `showing <${this.localName}>`);
  }
}

// The panel runs in its own iframe, so this registry is ours alone — but the guard costs
// nothing and keeps a second definition from throwing if that ever stops being true.
for (const tagName of ["ha-map", "ha-locations-editor"]) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, class extends StubbedMapElement {});
  }
}

// hui-map-card-editor builds a selector out of these. Every other import of the two
// modules is either a side-effect import or `import type`.
export const MAP_CARD_MARKER_LABEL_MODES = ["name", "state", "attribute", "icon"];
