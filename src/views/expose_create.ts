import { mdiPlus, mdiFloppy } from "@mdi/js";
import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators";
import { ContextProvider } from "@lit/context";
import { Task } from "@lit/task";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-alert";
import "@ha/components/ha-card";
import "@ha/components/ha-fab";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-navigation-list";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import { throttle } from "@ha/common/util/throttle";
import type { HomeAssistant, Route } from "@ha/types";
import "../components/knx-configure-expose";

import "../components/knx-project-device-tree";
import {
  createExpose,
  updateExpose,
  getExposeConfig,
  validateExpose,
} from "services/websocket.service";

import type {
  ErrorDescription,
  ExposeData,
  ExposeType,
  ExposeVerificationResult,
} from "types/expose_data";

import { getPlatformStyle } from "../utils/common";
import { validDPTsForSchema } from "../utils/dpt";
import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";

const logger = new KNXLogger("knx-create-expose");

@customElement("knx-create-expose")
export class KNXCreateExpose extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @state() private _config?: ExposeData;

  @state() private _validationErrors?: ErrorDescription[];

  @state() private _validationBaseError?: string;

  @query("ha-alert") private _alertElement!: HTMLDivElement;

  private _intent?: "create" | "edit";

  // setting exposeType or exposeAddress will trigger the load tasks and a rerender
  private exposeType?: ExposeType;

  private exposeAddress?: string;

  private _projectLoadTask = new Task(this, {
    args: () => [],
    task: async () => {
      if (!this.knx.projectInfo) return; // no project
      if (this.knx.projectData) return; // already loaded
      await this.knx.loadProject();
    },
  });

  private _schemaLoadTask = new Task(this, {
    args: () => [this.exposeType] as const,
    task: async ([exposedPlatform]) => {
      if (!exposedPlatform) return;
      await this.knx.loadExposeSchema(exposedPlatform);
    },
  });

  private _exposeConfigLoadTask = new Task(this, {
    args: () => [this.exposeAddress] as const,
    task: async ([exposeAddress]) => {
      if (!exposeAddress) return;
      const data = await getExposeConfig(this.hass, exposeAddress);
      this.exposeType = data.type;
      this._config = data;
    },
  });

  private _dragDropContextProvider = new ContextProvider(this, {
    context: dragDropContext,
    initialValue: new DragDropContext(() => {
      this._dragDropContextProvider.updateObservers();
    }),
  });

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("route")) {
      const intent = this.route.prefix.split("/").at(-1);
      if (intent === "create" || intent === "edit") {
        this._intent = intent;
      } else {
        logger.error("Unknown intent", intent);
        this._intent = undefined;
        return;
      }

      this._config = undefined; // clear config - eg. when `back` was used
      this._validationErrors = undefined; // clear validation errors - eg. when `back` was used
      this._validationBaseError = undefined;

      if (intent === "create") {
        // knx/expose/create -> path: ""; knx/expose/create/ -> path: "/"
        // knx/expose/create/time -> path: "/time"
        this.exposeAddress = undefined; // clear exposeAddress for the 'create' intent
        this.exposeType = this.route.path.split("/")[1];
      } else if (intent === "edit") {
        // knx/expose/edit/1/1/1 -> path: "/1/1/1"
        this.exposeAddress = this.route.path.substring(1);
        // this.exposeType will be set from load task result - triggering the next load task
      }
    }
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._intent) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }
    return this._projectLoadTask.render({
      initial: () => html`
        <hass-loading-screen .message=${"Waiting to fetch project data."}></hass-loading-screen>
      `,
      pending: () => html`
        <hass-loading-screen .message=${"Loading KNX project data."}></hass-loading-screen>
      `,
      error: (err) => this._renderError("Error loading KNX project", err),
      complete: () => {
        if (this._intent === "edit") {
          return this._renderEdit();
        }
        return this._renderCreate();
      },
    });
  }

  private _renderCreate(): TemplateResult {
    if (!this.exposeType) {
      return this._renderTypeSelection();
    }
    if (!this.knx.supportedExposeTypes.includes(this.exposeType)) {
      logger.error("Unknown type", this.exposeType);
      return this._renderTypeSelection();
    }
    return this._renderLoadSchema();
  }

  private _renderEdit(): TemplateResult {
    return this._exposeConfigLoadTask.render({
      initial: () => html`
        <hass-loading-screen .message=${"Waiting to fetch expose data."}></hass-loading-screen>
      `,
      pending: () => html`
        <hass-loading-screen .message=${"Loading expose data."}></hass-loading-screen>
      `,
      error: (err) =>
        this._renderError(
          html`${this.hass.localize("ui.card.common.expose_not_found")}:
            <code>${this.exposeAddress}</code>`,
          err,
        ),
      complete: () => {
        if (!this.exposeType) {
          return this._renderError(
            html`${this.hass.localize("ui.card.common.expose_not_found")}:
              <code>${this.exposeAddress}</code>`,
            new Error("Expose type unknown"),
          );
        }
        if (!this.knx.supportedExposeTypes.includes(this.exposeType)) {
          return this._renderError("Unsupported type", "Unsupported type: " + this.exposeType);
        }
        return this._renderLoadSchema();
      },
    });
  }

  private _renderLoadSchema(): TemplateResult {
    return this._schemaLoadTask.render({
      initial: () => html`
        <hass-loading-screen .message=${"Waiting to fetch schema."}></hass-loading-screen>
      `,
      pending: () => html`
        <hass-loading-screen .message=${"Loading expose type schema."}></hass-loading-screen>
      `,
      error: (err) => this._renderError("Error loading schema", err),
      complete: () => this._renderExposeConfig(this.exposeType),
    });
  }

  private _renderError(
    errorContent: TemplateResult | string,
    error?: Error | string,
  ): TemplateResult {
    logger.error("Error in create/edit expose", error);
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .back-path=${this.backPath}
        .header=${this.hass.localize("ui.panel.config.integrations.config_flow.error")}
      >
        <div class="content">
          <ha-alert alert-type="error"> ${errorContent} </ha-alert>
        </div>
      </hass-subpage>
    `;
  }

  private _renderTypeSelection(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .back-path=${this.backPath}
        .header=${this.hass.localize(
          "component.knx.config_panel.entities.create.type_selection.title",
        )}
      >
        <div class="type-selection">
          <ha-card
            outlined
            .header=${this.hass.localize(
              "component.knx.config_panel.entities.create.type_selection.header",
            )}
          >
            <!-- <p>Some help text</p> -->
            <ha-navigation-list
              .hass=${this.hass}
              .narrow=${this.narrow}
              .pages=${this.knx.supportedExposeTypes.map((type) => {
                const platformStyle = getPlatformStyle(type);
                return {
                  name: `${this.hass.localize(`component.${type}.title`)}`,
                  description: `${this.hass.localize(`component.knx.config_panel.entities.create.${type}.description`)}`,
                  iconPath: platformStyle.iconPath,
                  iconColor: platformStyle.color,
                  path: `/knx/expose/create/${type}`,
                };
              })}
              has-secondary
              .label=${this.hass.localize(
                "component.knx.config_panel.entities.create.type_selection.title",
              )}
            ></ha-navigation-list>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _renderExposeConfig(type: ExposeType): TemplateResult {
    const create = this._intent === "create";
    const schema = this.knx.exposeSchema[type]!;

    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow!}
      .back-path=${this.backPath}
      .header=${create
        ? this.hass.localize("component.knx.config_panel.entities.create.header")
        : `${this.hass.localize("ui.common.edit")}: ${this.exposeAddress}`}
    >
      <div class="content">
        <div class="expose-config">
          <knx-configure-expose
            .hass=${this.hass}
            .knx=${this.knx}
            .type=${type}
            .config=${this._config}
            .schema=${schema}
            .validationErrors=${this._validationErrors}
            @knx-expose-configuration-changed=${this._configChanged}
          >
            ${this._validationBaseError
              ? html`<ha-alert slot="knx-validation-error" alert-type="error">
                  <details>
                    <summary><b>Validation error</b></summary>
                    <p>Base error: ${this._validationBaseError}</p>
                    ${this._validationErrors?.map(
                      (err) =>
                        html`<p>
                          ${err.error_class}: ${err.error_message} in ${err.path?.join(" / ")}
                        </p>`,
                    ) ?? nothing}
                  </details>
                </ha-alert>`
              : nothing}
          </knx-configure-expose>
          <ha-fab
            .label=${create
              ? this.hass.localize("ui.common.create")
              : this.hass.localize("ui.common.save")}
            extended
            @click=${create ? this._exposeCreate : this._exposeUpdate}
            ?disabled=${this._config === undefined}
          >
            <ha-svg-icon slot="icon" .path=${create ? mdiPlus : mdiFloppy}></ha-svg-icon>
          </ha-fab>
        </div>
        ${this.knx.projectData
          ? html` <div class="panel">
              <knx-project-device-tree
                .data=${this.knx.projectData}
                .validDPTs=${validDPTsForSchema(schema, this.knx.dptMetadata)}
              ></knx-project-device-tree>
            </div>`
          : nothing}
      </div>
    </hass-subpage>`;
  }

  private _configChanged(event: CustomEvent<ExposeData>) {
    event.stopPropagation();
    logger.debug("configChanged", event.detail);
    this._config = event.detail;
    if (this.exposeAddress !== event.detail.address) {
      this.exposeAddress = event.detail.address;
      // Todo: Create new expose, delete old one, navigate to edit page of new expose
    }
    if (this._validationErrors) {
      this._exposeValidate();
    }
  }

  private _exposeValidate = throttle(() => {
    logger.debug("validate", this._config);
    if (this._config === undefined || this.exposeType === undefined) return;
    validateExpose(this.hass, this._config)
      .then((createExposeResult) => {
        this._handleValidationError(createExposeResult, false);
      })
      .catch((err) => {
        logger.error("validateExpose", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }, 250);

  private _exposeCreate(ev) {
    ev.stopPropagation();
    if (this._config === undefined || this.exposeAddress === undefined) {
      logger.error("No config found.");
      return;
    }
    createExpose(this.hass, this._config)
      .then((createExposeResult) => {
        if (this._handleValidationError(createExposeResult, true)) return;
        logger.debug("Successfully created expose", createExposeResult.expose_address);
        navigate("/knx/expose", { replace: true });
        this._exposeMoreInfoSettings(createExposeResult.expose_address);
      })
      .catch((err) => {
        logger.error("Error creating expose", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }

  private _exposeUpdate(ev) {
    ev.stopPropagation();
    if (
      this._config === undefined ||
      this.exposeAddress === undefined ||
      this.exposeType === undefined
    ) {
      logger.error("No config found.");
      return;
    }
    updateExpose(this.hass, this._config)
      .then((createExposeResult) => {
        if (this._handleValidationError(createExposeResult, true)) return;
        logger.debug("Successfully updated expose", this.exposeAddress);
        navigate("/knx/expose", { replace: true });
      })
      .catch((err) => {
        logger.error("Error updating expose", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }

  private _handleValidationError(result: ExposeVerificationResult, final: boolean): boolean {
    // return true if validation error; scroll to alert if final
    if (!result.success) {
      logger.warn("Validation error", result);
      this._validationErrors = result.errors;
      this._validationBaseError = result.error_base;
      if (final) {
        setTimeout(() => this._alertElement.scrollIntoView({ behavior: "smooth" }));
      }
      return true;
    }
    this._validationErrors = undefined;
    this._validationBaseError = undefined;
    logger.debug("Validation passed", result.expose_address);
    return false;
  }

  private _exposeMoreInfoSettings(address: string) {
    fireEvent(mainWindow.document.querySelector("home-assistant")!, "hass-more-info", {
      address,
      view: "settings",
    });
  }

  static styles = css`
    hass-loading-screen {
      --app-header-background-color: var(--sidebar-background-color);
      --app-header-text-color: var(--sidebar-text-color);
    }

    .type-selection {
      margin: 20px auto 80px;
      max-width: 720px;
    }

    @media screen and (max-width: 600px) {
      .panel {
        display: none;
      }
    }

    .content {
      display: flex;
      flex-direction: row;
      height: 100%;
      width: 100%;

      & > .expose-config {
        flex-grow: 1;
        flex-shrink: 1;
        height: 100%;
        overflow-y: scroll;
      }

      & > .panel {
        flex-grow: 0;
        flex-shrink: 3;
        width: 480px;
        min-width: 280px;
      }
    }

    knx-configure-expose {
      display: block;
      margin: 20px auto 40px; /* leave 80px space for fab */
      max-width: 720px;
    }

    ha-alert {
      display: block;
      margin: 20px auto;
      max-width: 720px;

      & summary {
        padding: 10px;
      }
    }

    ha-fab {
      /* not slot="fab" to move out of panel */
      float: right;
      margin-right: calc(16px + env(safe-area-inset-right));
      margin-bottom: 40px;
      z-index: 1;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-create-expose": KNXCreateExpose;
  }
}
