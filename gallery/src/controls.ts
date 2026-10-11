import { LitElement, html, nothing, css } from "lit";
import { customElement, property, state } from "lit/decorators";
import { live } from "lit/directives/live";
import { fireEvent } from "@ha/common/dom/fire_event";
import { mdiMagnify, mdiUndoVariant } from "@mdi/js";
import "@ha/components/input/ha-input";
import "@ha/components/ha-select";
import "@ha/components/ha-textarea";
import "@ha/components/ha-switch";
import "@ha/components/ha-checkbox";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-button";
import "@ha/components/ha-svg-icon";
import type { HaSelectSelectEvent } from "@ha/components/ha-select";
import { parseOverride, resolveValues } from "./state";
import en from "./localize/en.json";
import { galleryStyles } from "./styles";
import type { GalleryControl, GalleryMeta, GalleryValues } from "./types";

declare global {
  interface HASSDomEvents {
    "overrides-changed": GalleryValues;
    "slots-changed": string[];
  }
  interface HTMLElementEventMap {
    "overrides-changed": CustomEvent<GalleryValues>;
    "slots-changed": CustomEvent<string[]>;
  }
  interface HTMLElementTagNameMap {
    "knx-gallery-controls": KnxGalleryControls;
  }
}

@customElement("knx-gallery-controls")
export class KnxGalleryControls extends LitElement {
  @property({ attribute: false }) public meta!: GalleryMeta;
  @property({ attribute: false }) public scenarioId = "default";
  @property({ attribute: false }) public overrides: GalleryValues = {};
  @property({ attribute: false }) public enabledSlots: string[] = [];
  @state() private _drafts: Record<string, string> = {};
  @state() private _errors: Record<string, string> = {};

  @state() private _search = "";
  @state() private _filter: "all" | "editable" | "api" = "all";

  private _searchChanged(ev: Event) {
    this._search = (ev.currentTarget as HTMLElementTagNameMap["ha-input"]).value ?? "";
  }
  private _filterChanged(ev: Event) {
    this._filter = (ev.currentTarget as HTMLElement).dataset.filter as typeof this._filter;
  }
  private _matches(...text: (string | undefined)[]) {
    const content = text.join(" ").toLocaleLowerCase();
    return this._search
      .toLocaleLowerCase()
      .trim()
      .split(/\s+/)
      .every((word) => content.includes(word));
  }
  private _highlight(text = "") {
    const words = this._search.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return text;
    const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    return text
      .split(new RegExp(`(${pattern})`, "gi"))
      .map((part, index) => (index % 2 ? html`<mark>${part}</mark>` : part));
  }

  private _edit(control: GalleryControl, text: string) {
    this._drafts = { ...this._drafts, [control.key]: text };
    const result = parseOverride(control, text);
    this._errors = { ...this._errors, [control.key]: result.ok ? "" : result.error };
    if (result.ok) {
      fireEvent(this, "overrides-changed", { ...this.overrides, [control.key]: result.value });
    }
  }

  private _reset(key: string) {
    delete this._drafts[key];
    delete this._errors[key];
    const overrides = { ...this.overrides };
    delete overrides[key];
    fireEvent(this, "overrides-changed", overrides);
    this.requestUpdate();
  }

  private _input(ev: Event) {
    const input = ev.currentTarget as
      | HTMLElementTagNameMap["ha-input"]
      | HTMLElementTagNameMap["ha-textarea"]
      | HTMLElementTagNameMap["ha-switch"];
    const control = this.meta.controls.find((item) => item.key === input.id)!;
    this._edit(control, "checked" in input ? String(input.checked) : (input.value ?? ""));
  }
  private _selected(ev: HaSelectSelectEvent<string>) {
    const input = ev.currentTarget as HTMLElementTagNameMap["ha-select"];
    const control = this.meta.controls.find((item) => item.key === input.id)!;
    this._edit(control, ev.detail.value);
  }
  private _resetClicked(ev: Event) {
    this._reset((ev.currentTarget as HTMLElement).dataset.key!);
  }
  private _slotChanged(ev: Event) {
    const input = ev.currentTarget as HTMLElementTagNameMap["ha-checkbox"];
    const name = input.value!;
    fireEvent(
      this,
      "slots-changed",
      input.checked
        ? [...this.enabledSlots, name]
        : this.enabledSlots.filter((slot) => slot !== name),
    );
  }
  protected render() {
    if (!this.meta) return nothing;
    const values = resolveValues(this.meta, this.scenarioId, this.overrides);
    const baseline = resolveValues(this.meta, this.scenarioId, {});
    const editable = this.meta.controls.length || this.meta.slots.length;
    const remainingApi = this.meta.api.filter((api) =>
      api.kind === "property"
        ? !this.meta.controls.some(
            (control) => control.target === "property" && control.key === api.name,
          )
        : api.kind !== "slot" ||
          !this.meta.slots.some((slot) => (slot.name || "default") === api.name),
    );
    const controls = this.meta.controls.map((control) => {
      const { description, details } = control;
      return {
        control,
        description,
        details,
        visible:
          this._filter !== "api" &&
          this._matches(
            control.key,
            control.label,
            description,
            details,
            control.target === "example" ? en.ui.exampleOption : undefined,
          ),
      };
    });
    const slots = this.meta.slots.map((slot) => {
      const name = slot.name || "default";
      const api = this.meta.api.find((item) => item.kind === "slot" && item.name === name);
      return {
        slot,
        name,
        api,
        visible:
          this._filter !== "api" && this._matches(name, slot.label, api?.description, api?.details),
      };
    });
    const apiEntries = remainingApi.map((api) => ({
      api,
      visible: this._filter !== "editable" && this._matches(api.name, api.description, api.details),
    }));
    const controlCount = controls.filter((entry) => entry.visible).length;
    const slotCount = slots.filter((entry) => entry.visible).length;
    const apiCount = apiEntries.filter((entry) => entry.visible).length;
    const total = controls.length + slots.length + apiEntries.length;
    const count = controlCount + slotCount + apiCount;
    const reference = html`<div class="api-reference" ?hidden=${!apiCount}>
      ${(["property", "method", "slot", "event", "callback"] as const).map((kind) => {
        const entries = apiEntries.filter(({ api }) => api.kind === kind);
        const visibleCount = entries.filter((entry) => entry.visible).length;
        return entries.length
          ? html`<section class="inspector-group" ?hidden=${!visibleCount}>
              <h3 class="inspector-section">
                ${kind === "property" && controls.length ? en.ui.additionalProperties : en.ui.apiGroups[kind]}
                <span>${visibleCount}</span>
              </h3>
              <dl>
                ${entries.map(
                  ({ api, visible }) =>
                    html` <div class="api-entry" ?hidden=${!visible}>
                      <dt><code>${this._highlight(api.name)}</code></dt>
                      <dd>${this._highlight(api.description)}${this._apiDetails(api.details)}</dd>
                    </div>`,
                )}
              </dl>
            </section>`
          : nothing;
      })}
    </div>`;
    return html`
      <div class="inspector-tools" ?hidden=${!total}>
        <ha-input
          class="inspector-search"
          appearance="outlined"
          .type=${"search"}
          .placeholder=${en.ui.searchInspector}
          .withClear=${true}
          .value=${this._search}
          @input=${this._searchChanged}
        >
          <span slot="label" class="sr-only">${en.ui.searchInspector}</span>
          <ha-svg-icon slot="start" .path=${mdiMagnify}></ha-svg-icon>
        </ha-input>
        <div class="inspector-filter-row">
          <div
            class="inspector-filters"
            role="group"
            aria-label=${en.ui.inspectorFilters}
            ?hidden=${!editable || !remainingApi.length}
          >
            ${(["all", "editable", "api"] as const).map(
              (filter) =>
                html` <ha-button
                  size="s"
                  appearance=${this._filter === filter ? "accent" : "plain"}
                  variant="neutral"
                  .ariaLabel=${`${en.ui.inspectorFilter[filter]}${this._filter === filter ? ` · ${en.ui.selected}` : ""}`}
                  data-filter=${filter}
                  @click=${this._filterChanged}
                  >${en.ui.inspectorFilter[filter]}</ha-button
                >`,
            )}
          </div>
          <span class="inspector-count" aria-live="polite" aria-atomic="true"
            >${en.ui.inspectorResults.replace("{count}", String(count)).replace("{total}", String(total))}</span
          >
        </div>
      </div>
      <div class="inspector-fields">
        <div class="component-context">
          <code>${this.meta.tag}</code>
          <p>${this.meta.description}</p>
        </div>
        <slot name="relationships"></slot>
        <section class="inspector-group" ?hidden=${!controlCount}>
          ${this.meta.controls.length ? html`<h3 class="inspector-section" ?hidden=${!controlCount}>${en.ui.properties} <span>${controlCount}</span></h3>` : nothing}
          ${controls.map(({ control, description, details, visible }) => {
            const { key, kind } = control;
            const value = values[key];
            const text =
              this._drafts[key] ??
              (kind === "text" ? String(value) : JSON.stringify(value, null, 2));
            const error = this._errors[key];
            return html`<div
              class="control"
              ?hidden=${!visible}
              role="group"
              aria-label=${control.label}
              aria-describedby=${`context-${key}`}
            >
              <div
                class=${`control-editor${kind === "number" || kind === "text" || kind === "json" ? " compact-editor" : ""}`}
              >
                ${
                  kind === "boolean"
                    ? html`<ha-switch id=${key} .checked=${Boolean(value)} @change=${this._input}
                        >${this._highlight(control.label)}</ha-switch
                      >`
                    : kind === "select"
                      ? html`<ha-select
                          id=${key}
                          .label=${control.label}
                          .value=${JSON.stringify(value)}
                          .options=${control.options?.map((option) => ({ label: option.label, value: JSON.stringify(option.value) }))}
                          @selected=${this._selected}
                        ></ha-select>`
                      : kind === "json"
                        ? html`<span class="control-label" aria-hidden="true"
                              >${this._highlight(control.label)}</span
                            ><ha-textarea
                              id=${key}
                              class=${error ? "invalid" : ""}
                              .resize=${"vertical"}
                              .rows=${4}
                              .spellcheck=${false}
                              .value=${live(text)}
                              .invalid=${Boolean(error)}
                              .validationMessage=${error ?? ""}
                              @input=${this._input}
                              ><span slot="label" class="sr-only"
                                >${control.label}</span
                              ></ha-textarea
                            >`
                        : html`<span class="control-label" aria-hidden="true"
                              >${this._highlight(control.label)}</span
                            ><ha-input
                              id=${key}
                              appearance="outlined"
                              .type=${kind === "number" ? "number" : "text"}
                              .step=${"any"}
                              .value=${live(text)}
                              .invalid=${Boolean(error)}
                              .validationMessage=${error ?? ""}
                              @input=${this._input}
                              ><span slot="label" class="sr-only">${control.label}</span></ha-input
                            >`
                }
                <ha-icon-button
                  class="reset-property"
                  .label=${en.ui.resetProperty.replace("{label}", control.label)}
                  .path=${mdiUndoVariant}
                  .disabled=${!Object.prototype.hasOwnProperty.call(this.overrides, key) && !Object.prototype.hasOwnProperty.call(this._drafts, key)}
                  data-key=${key}
                  @click=${this._resetClicked}
                ></ha-icon-button>
              </div>
              ${(kind === "boolean" || kind === "select") && error ? html`<span class="error" role="alert">${error}</span>` : nothing}
              <div class="control-meta">
                <code>${this._highlight(key)}</code><span>${en.ui.controlKinds[kind]}</span>
                ${control.target === "example" ? html`<span>${en.ui.exampleOption}</span>` : nothing}
                <span class="override-state"
                  >${Object.prototype.hasOwnProperty.call(this.overrides, key) ? en.ui.overridden : nothing}</span
                >
              </div>
              <div id=${`context-${key}`}>
                ${description ? html`<p class="control-description">${this._highlight(description)}</p>` : nothing}
                ${
                  !Object.prototype.hasOwnProperty.call(this.overrides, key) && !error
                    ? nothing
                    : kind === "json"
                      ? html`<details class="scenario-value">
                          <summary>${en.ui.scenarioValue}</summary>
                          <pre>${JSON.stringify(baseline[key], null, 2)}</pre>
                        </details>`
                      : html`<p class="scenario-value">
                          ${en.ui.scenarioValue}: <code>${JSON.stringify(baseline[key])}</code>
                        </p>`
                }
              </div>
              ${this._apiDetails(details)}
            </div>`;
          })}
        </section>
        <section class="inspector-group" ?hidden=${!slotCount}>
          ${
            this.meta.slots.length
              ? html`<h3 class="inspector-section" ?hidden=${!slotCount}>
                    ${en.ui.slots} <span>${slotCount}</span>
                  </h3>
                  ${slots.map(({ slot, name, api, visible }) => {
                    return html`<div
                      class="slot-control"
                      ?hidden=${!visible}
                      role="group"
                      aria-label=${slot.label}
                      aria-describedby=${`slot-context-${name}`}
                    >
                      <ha-checkbox
                        class="slot"
                        .checked=${this.enabledSlots.includes(slot.name)}
                        .value=${slot.name}
                        @change=${this._slotChanged}
                        >${this._highlight(slot.label)}</ha-checkbox
                      >
                      <div class="control-meta">
                        <code>${this._highlight(name)}</code><span>${en.ui.slot}</span>
                      </div>
                      <p class="control-description" id=${`slot-context-${name}`}>
                        ${this._highlight(api?.description)}
                      </p>
                      ${this._apiDetails(api?.details)}
                    </div>`;
                  })}`
              : nothing
          }
        </section>
        ${reference}
        <p class="inspector-empty" ?hidden=${!total || !!count}>${en.ui.noInspectorResults}</p>
        ${!editable && !remainingApi.length ? html`<p>${en.ui.noControls}</p>` : nothing}
        ${
          this.meta.controls.length
            ? html`<details
                class="active-overrides"
                ?hidden=${!!this._search.trim() || this._filter === "api"}
              >
                <summary>${en.ui.overrides} (${Object.keys(this.overrides).length})</summary>
                <pre>${JSON.stringify(this.overrides, null, 2)}</pre>
              </details>`
            : nothing
        }
      </div>
    `;
  }

  private _apiDetails(details?: string) {
    return details
      ? html`<details
          class="api-details"
          .open=${
            !!this._search.trim() &&
            this._search
              .trim()
              .toLocaleLowerCase()
              .split(/\s+/)
              .some((word) => details.toLocaleLowerCase().includes(word))
          }
        >
          <summary>${en.ui.apiDetails}</summary>
          <p>${this._highlight(details)}</p>
        </details>`
      : nothing;
  }
  static styles = [
    galleryStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
    `,
  ];
}
