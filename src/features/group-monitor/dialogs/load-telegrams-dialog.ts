import { mdiClock, mdiCalendar, mdiDatabaseSearch } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/components/ha-button";
import "@ha/components/ha-dialog";
import "@ha/components/ha-svg-icon";
import "@ha/components/input/ha-input";
import "@ha/components/ha-select";
import "@ha/components/ha-list-item";
import "@ha/components/ha-date-input";
import "@ha/components/ha-time-input";
import "@ha/components/ha-alert";
import "@ha/components/ha-spinner";

import { fireEvent } from "@ha/common/dom/fire_event";
import type { HassDialog } from "@ha/dialogs/make-dialog-manager";
import type { HomeAssistant } from "@ha/types";

import type { KNX } from "../../../types/knx";
import { queryTelegrams } from "../../../services/websocket.service";
import type { TelegramDict } from "../../../types/websocket";

export interface LoadTelegramsDialogParams {
  knx: KNX;
  onLoad: (telegrams: TelegramDict[], limitReached: boolean) => void;
}

@customElement("knx-load-telegrams-dialog")
export class LoadTelegramsDialog
  extends LitElement
  implements HassDialog<LoadTelegramsDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _knx!: KNX;

  @state() private _params?: LoadTelegramsDialogParams;

  @state() private _open = false;

  @state() private _loading = false;

  @state() private _error?: string;

  @state() private _limitReached = false;

  // Custom relative
  @state() private _relValue = 1;

  @state() private _relUnit: "minutes" | "hours" | "days" = "hours";

  // Custom absolute
  @state() private _startDate?: string;

  @state() private _startTime = "00:00:00";

  @state() private _endDate?: string;

  @state() private _endTime = "23:59:59";

  public async showDialog(params: LoadTelegramsDialogParams): Promise<void> {
    this._knx = params.knx;
    this._params = params;
    this._open = true;
    this._error = undefined;
    this._limitReached = false;
  }

  public closeDialog(): boolean {
    this._open = false;
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName }, { bubbles: false });
    return true;
  }

  private _handleQuickRange(seconds: number) {
    const startTime = new Date(Date.now() - seconds * 1000).toISOString();
    this._loadTelegrams({ start_time: startTime });
  }

  private _handleCustomRelative() {
    let seconds = this._relValue;
    if (this._relUnit === "minutes") seconds *= 60;
    if (this._relUnit === "hours") seconds *= 3600;
    if (this._relUnit === "days") seconds *= 86400;

    const startTime = new Date(Date.now() - seconds * 1000).toISOString();
    this._loadTelegrams({ start_time: startTime });
  }

  private _handleCustomAbsolute() {
    if (!this._startDate) {
      this._error = this._knx.localize("group_monitor_error_start_date_required");
      return;
    }

    const start = new Date(`${this._startDate}T${this._startTime}`).toISOString();
    let end: string | undefined;
    if (this._endDate) {
      end = new Date(`${this._endDate}T${this._endTime}`).toISOString();
    }

    this._loadTelegrams({ start_time: start, end_time: end });
  }

  private async _loadTelegrams(params: { start_time: string; end_time?: string }) {
    this._loading = true;
    this._error = undefined;
    this._limitReached = false;

    try {
      const result = await queryTelegrams(this.hass, params);
      this._limitReached = result.limit_reached;
      this._params?.onLoad(result.telegrams, result.limit_reached);
      if (!result.limit_reached) {
        this.closeDialog();
      }
    } catch (_err: unknown) {
      this._error = this._knx.localize("group_monitor_error_fetch");
    } finally {
      this._loading = false;
    }
  }

  private _handleQuickRange5m() {
    this._handleQuickRange(5 * 60);
  }

  private _handleQuickRange30m() {
    this._handleQuickRange(30 * 60);
  }

  private _handleQuickRange1h() {
    this._handleQuickRange(3600);
  }

  private _handleQuickRange6h() {
    this._handleQuickRange(6 * 3600);
  }

  private _handleQuickRange1d() {
    this._handleQuickRange(86400);
  }

  private _handleQuickRange1w() {
    this._handleQuickRange(7 * 86400);
  }

  private _handleRelValueInput(ev: InputEvent) {
    const value = parseInt((ev.target as HTMLInputElement).value, 10);
    this._relValue = isNaN(value) || value < 1 ? 1 : value;
  }

  private _handleRelUnitSelected(ev: any) {
    this._relUnit = ev.target.value;
  }

  private _handleStartDateChanged(ev: CustomEvent) {
    this._startDate = ev.detail.value;
  }

  private _handleStartTimeChanged(ev: CustomEvent) {
    this._startTime = ev.detail.value;
  }

  private _handleEndDateChanged(ev: CustomEvent) {
    this._endDate = ev.detail.value;
  }

  private _handleEndTimeChanged(ev: CustomEvent) {
    this._endTime = ev.detail.value;
  }

  protected render() {
    if (!this._open) {
      return nothing;
    }

    return html`
      <ha-dialog
        .open=${this._open}
        @closed=${this.closeDialog}
        .headerTitle=${this._knx.localize("group_monitor_load_history")}
      >
        <div class="content">
          ${this._error ? html`<ha-alert alert-type="error">${this._error}</ha-alert>` : nothing}
          ${this._limitReached
            ? html`<ha-alert alert-type="warning"
                >${this._knx.localize("group_monitor_limit_reached")}</ha-alert
              >`
            : nothing}

          <div class="section">
            <div class="section-header">
              <ha-svg-icon .path=${mdiClock}></ha-svg-icon>
              <span>${this._knx.localize("group_monitor_quick_range")}</span>
            </div>
            <div class="quick-range-grid">
              <ha-button @click=${this._handleQuickRange5m} .disabled=${this._loading}
                >${this._knx.localize("group_monitor_range_5min")}</ha-button
              >
              <ha-button @click=${this._handleQuickRange30m} .disabled=${this._loading}
                >${this._knx.localize("group_monitor_range_30min")}</ha-button
              >
              <ha-button @click=${this._handleQuickRange1h} .disabled=${this._loading}
                >${this._knx.localize("group_monitor_range_1h")}</ha-button
              >
              <ha-button @click=${this._handleQuickRange6h} .disabled=${this._loading}
                >${this._knx.localize("group_monitor_range_6h")}</ha-button
              >
              <ha-button @click=${this._handleQuickRange1d} .disabled=${this._loading}
                >${this._knx.localize("group_monitor_range_1d")}</ha-button
              >
              <ha-button @click=${this._handleQuickRange1w} .disabled=${this._loading}
                >${this._knx.localize("group_monitor_range_1w")}</ha-button
              >
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <ha-svg-icon .path=${mdiClock}></ha-svg-icon>
              <span>${this._knx.localize("group_monitor_custom_relative")}</span>
            </div>
            <div class="custom-relative-row">
              <ha-input
                type="number"
                .value=${String(this._relValue)}
                @input=${this._handleRelValueInput}
                min="1"
              ></ha-input>
              <ha-select
                .value=${this._relUnit}
                @selected=${this._handleRelUnitSelected}
                fixedMenuPosition
              >
                <ha-list-item value="minutes"
                  >${this._knx.localize("group_monitor_minutes")}</ha-list-item
                >
                <ha-list-item value="hours"
                  >${this._knx.localize("group_monitor_hours")}</ha-list-item
                >
                <ha-list-item value="days"
                  >${this._knx.localize("group_monitor_days")}</ha-list-item
                >
              </ha-select>
              <ha-button @click=${this._handleCustomRelative} .disabled=${this._loading}>
                ${this._knx.localize("group_monitor_load")}
              </ha-button>
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <ha-svg-icon .path=${mdiCalendar}></ha-svg-icon>
              <span>${this._knx.localize("group_monitor_custom_absolute")}</span>
            </div>
            <div class="absolute-range">
              <div class="date-time-row">
                <ha-date-input
                  .label=${this._knx.localize("group_monitor_start_time")}
                  .locale=${this.hass.locale}
                  .value=${this._startDate}
                  @value-changed=${this._handleStartDateChanged}
                ></ha-date-input>
                <ha-time-input
                  .locale=${this.hass.locale}
                  .value=${this._startTime}
                  @value-changed=${this._handleStartTimeChanged}
                ></ha-time-input>
              </div>
              <div class="date-time-row">
                <ha-date-input
                  .label=${this._knx.localize("group_monitor_end_time")}
                  .locale=${this.hass.locale}
                  .value=${this._endDate}
                  @value-changed=${this._handleEndDateChanged}
                ></ha-date-input>
                <ha-time-input
                  .locale=${this.hass.locale}
                  .value=${this._endTime}
                  @value-changed=${this._handleEndTimeChanged}
                ></ha-time-input>
              </div>
              <ha-button raised @click=${this._handleCustomAbsolute} .disabled=${this._loading}>
                ${this._loading
                  ? html`<ha-spinner active size="tiny"></ha-spinner>`
                  : html`<ha-svg-icon .path=${mdiDatabaseSearch} slot="icon"></ha-svg-icon>`}
                ${this._knx.localize("group_monitor_search_range")}
              </ha-button>
            </div>
          </div>
        </div>
        <ha-button slot="secondaryAction" @click=${this.closeDialog}>
          ${this.hass.localize("ui.common.cancel")}
        </ha-button>
      </ha-dialog>
    `;
  }

  static styles = css`
    .content {
      display: flex;
      flex-direction: column;
      gap: 24px;
      width: 100%;
      max-width: 400px;
      box-sizing: border-box;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.1em;
    }

    .quick-range-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    @media all and (max-width: 450px) {
      .quick-range-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .custom-relative-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .custom-relative-row ha-input {
      width: 80px;
    }

    .custom-relative-row ha-select {
      flex: 1;
    }

    .absolute-range {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .date-time-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    @media all and (max-width: 450px) {
      .date-time-row {
        flex-direction: column;
        align-items: stretch;
      }
    }

    .date-time-row ha-date-input {
      flex: 1;
    }

    ha-alert {
      margin-bottom: 16px;
    }

    ha-spinner {
      margin-right: 8px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-load-telegrams-dialog": LoadTelegramsDialog;
  }
}
