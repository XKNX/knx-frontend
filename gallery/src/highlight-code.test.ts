/* eslint-disable no-template-curly-in-string -- Test actual Lit example source as plain text. */
import { render } from "lit";
import { describe, expect, it } from "vitest";
import { highlightCode } from "./highlight-code";

// Protect exact copying/escaping and the JavaScript expressions inside Lit markup.
describe("gallery code highlighting", () => {
  it("colors JavaScript and embedded Lit HTML while preserving the source", () => {
    const source =
      'import { html } from "lit";\n// Example\nhtml`<knx-example .height=${12} ?hidden=${false}>${html`<span slot="header">${"Room"}</span>`}</knx-example>`;';
    const target = document.createElement("code");
    render(highlightCode(source), target);
    expect(target.textContent).toBe(source);
    expect(target.querySelector(".syntax-keyword")?.textContent).toBe("import");
    expect(target.querySelector(".syntax-comment")?.textContent).toBe("// Example");
    expect([...target.querySelectorAll(".syntax-tag")].map((token) => token.textContent)).toContain(
      "knx-example",
    );
    expect([...target.querySelectorAll(".syntax-tag")].map((token) => token.textContent)).toContain(
      "span",
    );
    expect(
      [...target.querySelectorAll(".syntax-property")].map((token) => token.textContent),
    ).toContain(".height");
    expect(
      [...target.querySelectorAll(".syntax-literal")].map((token) => token.textContent),
    ).toEqual(expect.arrayContaining(["12", "false"]));
  });

  it("escapes markup and tolerates incomplete source without changing its text", () => {
    const source = 'html`<img src=x onerror="alert(1)">${"<script>"';
    const target = document.createElement("code");
    render(highlightCode(source), target);
    expect(target.textContent).toBe(source);
    expect(target.querySelector("img, script")).toBeNull();
    expect(target.querySelector("span")).not.toBeNull();
  });
});
