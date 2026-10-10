import "./english-locale";
import { html, render } from "lit";
import { themeStyles } from "@ha/resources/theme/theme";
import en from "./localize/en.json";
import "./gallery";

const theme = document.createElement("style");
theme.textContent = themeStyles;
document.head.append(theme);

document.title = en.title;
document.body.style.margin = "0";
render(html`<knx-component-gallery></knx-component-gallery>`, document.body);
