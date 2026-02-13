import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { Task } from "@lit/task";
import type { TemplateResult } from "lit";

import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/ha-wa-dialog";
import "@ha/components/ha-alert";
import "@ha/layouts/hass-loading-screen";

import type { HassDialog } from "@ha/dialogs/make-dialog-manager";
import type { HomeAssistant } from "@ha/types";

import { getTimeServerConfig, updateTimeServerConfig } from "../services/websocket.service";
import "../components/knx-group-address-selector";
import type { KNX } from "../types/knx";
import type { TimeServerData, ErrorDescription, CreateEntityResult } from "../types/entity_data";
import { KNXLogger } from "../tools/knx-logger";
import { extractValidationErrors, getValidationError } from "../utils/validation";

const logger = new KNXLogger("time-server-dialog");

export interface KnxTimeServerDialogParams {
  knx: KNX;
}

@customElement("knx-time-server-dialog")
export class KnxTimeServerDialog
  extends LitElement
  implements HassDialog<KnxTimeServerDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @state() private _open = false;

  @state() private _data?: TimeServerData;

  @state() private _errors?: ErrorDescription[];

  private _loadConfigTask = new Task(this, {
    args: () => [this._open],
    task: async () => {
      if (!this._open) return;
      this._errors = undefined;
      if (this.knx.projectInfo && !this.knx.projectData) {
        await this.knx.loadProject();
      }
      this._data = await getTimeServerConfig(this.hass);
      logger.debug("getTimeServerConfig", this._data);
    },
  });

  public showDialog(params: KnxTimeServerDialogParams): void {
    this.knx = params.knx;
    this._data = undefined;
    this._open = true;
  }

  public closeDialog(_historyState?: any): boolean {
    this._open = false;
    this._data = undefined;
    return true;
  }

  private _cancel(): void {
    this.closeDialog();
  }

  private _save(): void {
    // Send update using the TimeServerData shape
    const payload: TimeServerData = this._data ?? {};
    logger.debug("updateTimeServerConfig request", payload);
    updateTimeServerConfig(this.hass, payload)
      .then((res: CreateEntityResult) => {
        logger.debug("updateTimeServerConfig response", res);
        if (!res.success) {
          // backend validation errors
          this._errors = res.errors ?? [];
          return;
        }
        // success
        this._errors = undefined;
        this.closeDialog();
      })
      .catch((err) => {
        logger.error("updateTimeServerConfig error", err);
        // show as general error in validation area
        this._errors = [{ path: [], error_message: String(err), error_class: "exception" }];
      });
  }

  private _addressChanged(ev: CustomEvent): void {
    const key: string | undefined = (ev.target as any)?.key;
    const write = ev.detail.value?.write;
    if (!key) return;

    const newData = { ...(this._data ?? {}) };
    if (write) newData[key] = { write };
    else delete newData[key];
    this._data = newData;
    logger.debug("timeServerConfig changed", { key, write, data: this._data });
  }

  protected render() {
    if (!this._open) {
      return nothing;
    }

    return html`
      <ha-wa-dialog
        .hass=${this.hass}
        .open=${this._open}
        @closed=${this.closeDialog}
        .headerTitle=${"Send current time to KNX"}
      >
        <p class="description">
          Configure group addresses to periodically send the current time to the KNX bus. Time
          values are broadcast every hour. An empty address field disables broadcasting for that
          format.
        </p>
        ${this._loadConfigTask.render({
          initial: () => html`
            <hass-loading-screen
              no-toolbar
              narrow
              .message=${"Loading time server configuration."}
            ></hass-loading-screen>
          `,
          pending: () => html`
            <hass-loading-screen
              no-toolbar
              narrow
              .message=${"Loading time server configuration."}
            ></hass-loading-screen>
          `,
          complete: () => this._renderContent(),
          error: (err) => this._renderError(err),
        })}
      </ha-wa-dialog>
    `;
  }

  private _renderError(err: unknown): TemplateResult {
    return html`
      <ha-alert alert-type="error"> Error loading configuration: ${String(err)} </ha-alert>
    `;
  }

  private _renderContent(): TemplateResult {
    const baseError = getValidationError(this._errors);
    return html`
      ${baseError
        ? html`<ha-alert alert-type="error"> ${baseError.error_message} </ha-alert>`
        : nothing}

      <knx-group-address-selector
        .hass=${this.hass}
        .knx=${this.knx}
        .label=${"Time (DPT 10.001)"}
        .key=${"time"}
        .options=${{ write: { required: true }, validDPTs: [{ main: 10, sub: 1 }] }}
        .config=${this._data?.time ?? {}}
        .validationErrors=${extractValidationErrors(this._errors, "time")}
        @value-changed=${this._addressChanged}
      ></knx-group-address-selector>

      <knx-group-address-selector
        .hass=${this.hass}
        .knx=${this.knx}
        .label=${"Date (DPT 11.001)"}
        .key=${"date"}
        .options=${{ write: { required: true }, validDPTs: [{ main: 11, sub: 1 }] }}
        .config=${this._data?.date ?? {}}
        .validationErrors=${extractValidationErrors(this._errors, "date")}
        @value-changed=${this._addressChanged}
      ></knx-group-address-selector>

      <knx-group-address-selector
        .hass=${this.hass}
        .knx=${this.knx}
        .label=${"DateTime (DPT 19.001)"}
        .key=${"datetime"}
        .options=${{ write: { required: true }, validDPTs: [{ main: 19, sub: 1 }] }}
        .config=${this._data?.datetime ?? {}}
        .validationErrors=${extractValidationErrors(this._errors, "datetime")}
        @value-changed=${this._addressChanged}
      ></knx-group-address-selector>

      <ha-dialog-footer slot="footer">
        <ha-button slot="secondaryAction" @click=${this._cancel}>
          ${this.hass.localize("ui.common.cancel")}
        </ha-button>
        <ha-button slot="primaryAction" @click=${this._save}>
          ${this.hass.localize("ui.common.save")}
        </ha-button>
      </ha-dialog-footer>
    `;
  }

  static styles = css`
    .description {
      margin: 0 0 8px 0;
      color: var(--secondary-text-color);
    }

    knx-group-address-selector {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-time-server-dialog": KnxTimeServerDialog;
  }
}
