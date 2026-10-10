import { html, type TemplateResult } from "lit";
import { parseMixed } from "@lezer/common";
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { parser as javascriptParser } from "@lezer/javascript";
import { parser as htmlParser } from "@lezer/html";

const parser = javascriptParser.configure({
  wrap: parseMixed((node, input) => {
    const parent = node.node.parent;
    if (
      node.name !== "TemplateString" ||
      parent?.name !== "TaggedTemplateExpression" ||
      !/^(html|svg)$/.test(input.read(parent.from, node.from).trim())
    ) {
      return null;
    }
    const overlay: { from: number; to: number }[] = [];
    let from = node.from + 1;
    for (let child = node.node.firstChild; child; child = child.nextSibling) {
      if (child.name !== "Interpolation") continue;
      if (from < child.from) overlay.push({ from, to: child.from });
      from = child.to;
    }
    const to = node.to - (input.read(node.to - 1, node.to) === "`" ? 1 : 0);
    if (from < to) overlay.push({ from, to });
    return { parser: htmlParser, overlay };
  }),
});

const highlighter = tagHighlighter([
  { tag: tags.keyword, class: "syntax-keyword" },
  { tag: [tags.string, tags.attributeValue], class: "syntax-string" },
  { tag: [tags.number, tags.bool, tags.null], class: "syntax-literal" },
  { tag: tags.comment, class: "syntax-comment" },
  { tag: tags.tagName, class: "syntax-tag" },
  { tag: [tags.attributeName, tags.propertyName], class: "syntax-property" },
  { tag: tags.function(tags.variableName), class: "syntax-function" },
]);

/** Token text remains Lit text bindings, never HTML interpreted from the example. */
export function highlightCode(source: string): (string | TemplateResult)[] {
  const result: (string | TemplateResult)[] = [];
  let position = 0;
  highlightTree(parser.parse(source), highlighter, (from, to, classes) => {
    if (from > position) result.push(source.slice(position, from));
    result.push(html`<span class=${classes}>${source.slice(from, to)}</span>`);
    position = to;
  });
  if (position < source.length) result.push(source.slice(position));
  return result;
}
