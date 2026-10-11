/* eslint-disable no-template-curly-in-string, lit/no-useless-template-literals -- Assert literal generated Lit source, including dynamic text values. */
import { html, nothing, render } from "lit";
import { keyed } from "lit/directives/keyed";
import { createRef, ref } from "lit/directives/ref";
import { describe, expect, it } from "vitest";
import { dialogToCode, templateToCode } from "./code";

// Serializer fixtures deliberately use an unregistered element.
const fixtureHtml = html;

// Protect the displayed usage from losing actual property values, slots or callbacks.
describe("gallery usage code", () => {
  it("preserves property bindings and enabled slot content without inventing controls", () => {
    const code = templateToCode(
      fixtureHtml`<knx-example
        .height=${12}
        .disabled=${false}
        .options=${{ label: "Room", keys: [1, null], unset: undefined }}
        >${html`<span slot="header">${"Room <one>"}</span>`}${nothing}</knx-example
      >`,
    );
    expect(code).toContain(".height=${12}");
    expect(code).toContain(".disabled=${false}");
    expect(code).toContain('"keys": [1, null]');
    expect(code).toContain('"unset": undefined');
    expect(code).toContain('<span slot="header">${"Room <one>"}</span>');
    expect(code).not.toContain("[object Object]");
    expect(code).not.toContain("showHeader");
  });

  it("documents environment and callback dependencies without calling them", () => {
    const callback = () => {
      throw new Error("must never run");
    };
    const code = templateToCode(
      fixtureHtml`<knx-example
        .hass=${{ privateFixture: "omit" }}
        .knx=${{ privateFixture: "omit" }}
        .localizeFunc=${callback}
        @value-changed=${callback}
        .config=${{ mapper: callback }}
      ></knx-example>`,
    );
    expect(code).toContain(".hass=${hass}");
    expect(code).toContain(".knx=${knx}");
    expect(code).toContain(".localizeFunc=${localizeFunc}");
    expect(code).toContain("@value-changed=${localizeFunc}");
    expect(code).toContain('"mapper": localizeFunc');
    expect(code).toContain("Application supplies: hass, knx");
    expect(code).toContain("Application implements: localizeFunc");
    expect(code).not.toContain("privateFixture");
  });

  it("keeps keyed and ref behavior while never serializing a live element", () => {
    const target = createRef();
    const template = html`<div ${ref(target)}>
      ${keyed("a", html`<input .value=${"test"} />`)}
    </div>`;
    render(template, document.createElement("div"));
    const code = templateToCode(template);
    expect(code).toContain('import { createRef, ref } from "lit/directives/ref.js";');
    expect(code).toContain("const elementRef = createRef();");
    expect(code).toContain("${ref(elementRef)}");
    expect(code).toContain('${keyed("a", html`<input .value=${"test"} />`)}');
    expect(code).not.toContain("HTMLDivElement");
  });

  it("preserves undefined, arrays and literal syntax safely", () => {
    const code = templateToCode(
      fixtureHtml`<knx-example .value=${undefined}
        >${[html`<span>${'"`${value}\\'}</span>`, html`<span>${0}</span>`]}</knx-example
      >`,
    );
    expect(code).toContain(".value=${undefined}");
    expect(code).toContain(JSON.stringify('"`${value}\\'));
    expect(code).toContain("<span>${0}</span>");
  });
  it("shows the real dialog opening API with application dependencies", () => {
    const callback = () => {
      throw new Error("must never run");
    };
    const code = dialogToCode(
      "knx-send-dialog",
      {
        hass: { privateFixture: "omit" },
        nested: { knx: { privateFixture: "omit" } },
        address: "1/2/3",
        onSubmit: callback,
      },
      "../dialogs/knx-send-dialog",
    );
    expect(code).toContain('import { showDialog } from "@ha/dialogs/make-dialog-manager";');
    expect(code).toContain('await showDialog(host, "knx-send-dialog", {');
    expect(code).toContain('"hass": hass');
    expect(code).toContain('"knx": knx');
    expect(code).toContain('"address": "1/2/3"');
    expect(code).toContain('"onSubmit": onSubmit');
    expect(code).toContain('() => import("../dialogs/knx-send-dialog")');
    expect(code).toContain("Application supplies: host, hass, knx");
    expect(code).toContain("Application implements: onSubmit");
    expect(code).not.toContain("privateFixture");
    expect(code).not.toContain("ha-button");
    expect(code).not.toContain('from "lit"');
  });
});
