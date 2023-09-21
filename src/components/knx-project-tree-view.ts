import {
    css,
    CSSResultGroup,
    html,
    LitElement,
    TemplateResult,
} from "lit";
import { customElement, property } from "lit/decorators";
import { GroupRange } from "../types/websocket";

@customElement("knx-project-tree-view")
export class KNXProjectTreeView extends LitElement {

    @property({ type: Object, reflect: false }) data;

    protected render(): TemplateResult {
        return html`<div class="container ha-tree-view">${this._recurseData(this.data.group_ranges)}</div>`;
    }

    protected _renderGAs(group_range_data: GroupRange): TemplateResult {
        const tmpl = group_range_data.group_addresses 
            ? group_range_data.group_addresses.map((ga) => {
                const ga_name = this.data.group_addresses[ga]!.name
                return html`<summary class="ga">${ga} - ${ga_name}</summary>`;
            })
            : html``
        return html`${tmpl}`
    }

    protected _recurseData(data: Object): TemplateResult {
        const childTemplates = Object.keys(data).map(
            (key) => html`<details>
                <summary>${key} - ${data[key].name}</summary>
                ${data[key].group_ranges ? this._recurseData(data[key].group_ranges) : html``}
                ${this._renderGAs(data[key])}
            </details>`
        )
        return html`${childTemplates}`;
    }

    static get styles(): CSSResultGroup {
        return css`
        details details {
            margin-left: 10pt;
            display: block;
        }
        summary:hover {
            background-color: #363636;
            border: 1px;
        }
        summary.ga {
            margin-left: 10pt;
            display: block;
        }
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ha-tree-view": KNXProjectTreeView;
    }
}