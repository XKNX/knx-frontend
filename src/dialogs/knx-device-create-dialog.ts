/**
 * KNX Device Creation Dialog Component
 *
 * A modal dialog component for creating new KNX devices that provides
 * interactive form with device name and area selection, integration with
 * Home Assistant's device registry, real-time validation and error handling,
 * responsive design with proper dialog styling, accessibility support with
 * proper ARIA implementation, and callback-based communication with parent
 * components.
 *
 * Includes required device name validation, optional area assignment with
 * picker component, asynchronous device creation via WebSocket API, error
 * handling with navigation to error page, clean dialog lifecycle management,
 * and integration with Home Assistant's localization system.
 *
 * Workflow:
 * 1. User opens dialog from parent component with optional onClose callback
 * 2. User enters device name (required) and selects area (optional)
 * 3. Dialog validates input and creates device via API
 * 4. On success/error, dialog invokes onClose callback with result
 * 5. Parent receives device via callback (DeviceRegistryEntry or undefined)
 */

import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import { navigate } from "@ha/common/navigate";
import "@ha/components/ha-area-picker";
import "@ha/components/ha-wa-dialog";
import "@ha/components/ha-button";
import "@ha/components/ha-selector/ha-selector-text";

import type { DeviceRegistryEntry } from "@ha/data/device/device_registry";
import type { HomeAssistant } from "@ha/types";
import type { HassDialog } from "@ha/dialogs/make-dialog-manager";

import { createDevice } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";

// ============================================================================
// Component Logging
// ============================================================================

/** Logger instance for device creation dialog operations */
const logger = new KNXLogger("create_device_dialog");

// ============================================================================
// Dialog Parameters
// ============================================================================

/**
 * Parameters for the device creation dialog
 *
 * @property deviceName - Optional initial device name to pre-populate the form
 * @property onClose - Optional callback invoked when dialog closes with result:
 *   - DeviceRegistryEntry if device was successfully created
 *   - undefined if dialog was cancelled or creation failed
 */
export interface KnxDeviceCreateDialogParams {
  deviceName?: string;
  onClose?: (device: DeviceRegistryEntry | undefined) => void;
}

/**
 * Modal dialog component for creating new KNX devices
 * Handles user input, validation, API communication, and result reporting
 */

@customElement("knx-device-create-dialog")
export class DeviceCreateDialog
  extends LitElement
  implements HassDialog<KnxDeviceCreateDialogParams>
{
  /**
   * Home Assistant instance for accessing global functionality
   * Required for API calls, localization, and component integration
   */
  @property({ attribute: false }) public hass!: HomeAssistant;

  // ============================================================================
  // Internal State
  // ============================================================================

  /**
   * Dialog open state
   * Controls the visibility of the dialog
   */
  @state() private _open = false;

  /**
   * Dialog parameters including optional callback
   */
  @state() private _params?: KnxDeviceCreateDialogParams;

  /**
   * Initial device name value for the form
   * Can be pre-populated by parent component if desired
   */
  @state() private _deviceName?: string;

  /**
   * Selected area ID for the new device
   * Optional field that can be left undefined for devices without area assignment
   */
  @state() private _area?: string;

  // ============================================================================
  // Dialog Lifecycle Methods
  // ============================================================================

  /**
   * Opens the dialog with the given parameters
   * Implements HassDialog interface
   */
  public showDialog(params: KnxDeviceCreateDialogParams): void {
    this._params = params;
    this._deviceName = params.deviceName;
    this._area = undefined;
    this._open = true;
  }

  /**
   * Closes the dialog
   * Implements HassDialog interface requirement
   *
   * Performs internal cleanup and state reset. The dialog manager
   * handles dialog lifecycle, so no events are fired.
   *
   * @param _ev - Optional event parameter (unused but kept for interface compatibility)
   * @returns true to indicate successful closure
   */
  public closeDialog(_ev?: any): boolean {
    this._dialogClosed();
    return true;
  }

  /**
   * Internal cleanup and state reset
   * Resets all dialog state without triggering callbacks
   */
  private _dialogClosed(): void {
    this._open = false;
    this._params = undefined;
    this._deviceName = undefined;
    this._area = undefined;
  }

  /**
   * Handle cancel action
   *
   * Invokes the onClose callback with undefined to indicate cancellation,
   * then closes the dialog and cleans up state.
   */
  private _cancel(): void {
    if (this._params?.onClose) {
      this._params.onClose(undefined);
    }
    this._dialogClosed();
  }

  // ============================================================================
  // Device Creation Logic
  // ============================================================================

  /**
   * Handles device creation process including API call and error handling
   *
   * Process flow:
   * 1. Validates required device name is present
   * 2. Calls WebSocket API to create device with name and optional area
   * 3. On success: invokes onClose callback with created device, then closes dialog
   * 4. On error: logs error, navigates to error page, invokes callback with undefined
   * 5. Always closes dialog regardless of success/failure
   *
   * Error handling includes navigation to dedicated error page with
   * error details for user troubleshooting and support.
   */
  private _createDevice(): void {
    createDevice(this.hass, { name: this._deviceName!, area_id: this._area })
      .then((resultDevice) => {
        if (this._params?.onClose) {
          this._params.onClose(resultDevice);
        }
        this._dialogClosed();
      })
      .catch((err) => {
        logger.error("createDevice", err);
        navigate("/knx/error", { replace: true, data: err });
        if (this._params?.onClose) {
          this._params.onClose(undefined);
        }
        this._dialogClosed();
      });
  }

  // ============================================================================
  // Render Methods
  // ============================================================================

  /**
   * Main render method that creates the dialog interface
   *
   * Structure:
   * - Modal dialog container with proper accessibility attributes
   * - Text input for required device name with validation
   * - Area picker for optional area assignment
   * - Action buttons (Cancel/Add) with localized labels
   *
   * @returns Template result for the complete dialog interface
   */
  protected render() {
    return html`<ha-wa-dialog .open=${this._open} @closed=${this.closeDialog}>
      <span slot="headerTitle">Create new device</span>

      <ha-selector-text
        .hass=${this.hass}
        .label=${"Name"}
        .required=${true}
        .selector=${{ text: {} }}
        .key=${"_deviceName"}
        .value=${this._deviceName}
        @value-changed=${this._valueChanged}
      ></ha-selector-text>
      <ha-area-picker
        .hass=${this.hass}
        .label=${"Area"}
        .key=${"_area"}
        .value=${this._area}
        @value-changed=${this._valueChanged}
      >
      </ha-area-picker>

      <div slot="footer">
        <ha-button appearance="plain" @click=${this._cancel}>
          ${this.hass.localize("ui.common.cancel")}
        </ha-button>
        <ha-button @click=${this._createDevice}> ${this.hass.localize("ui.common.add")} </ha-button>
      </div>
    </ha-wa-dialog>`;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handles value changes from form input components
   *
   * Updates component properties based on the input component's key attribute.
   * This pattern allows multiple form controls to use the same handler by
   * specifying their target property name in the 'key' attribute.
   *
   * Event flow:
   * 1. Input component fires value-changed event with new value
   * 2. Handler extracts target property name from event target's key attribute
   * 3. Component property is updated with new value
   * 4. Event propagation is stopped to prevent bubbling
   *
   * Supported keys: '_deviceName' (string), '_area' (string | undefined)
   *
   * @param ev - Custom event containing the new value and target information
   */
  protected _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const target = ev.target as any;
    if (target?.key) {
      (this as any)[target.key] = ev.detail.value;
    }
  }

  // ============================================================================
  // Styles
  // ============================================================================

  /**
   * Component-specific styles
   * Sets custom dialog width for optimal form layout
   */

  static get styles() {
    return [
      css`
        ha-wa-dialog {
          --ha-dialog-width-md: 480px;
        }
      `,
    ];
  }
}

// ============================================================================
// Global Type Declarations
// ============================================================================

declare global {
  /**
   * HTML element tag name mapping for TypeScript support.
   */
  interface HTMLElementTagNameMap {
    "knx-device-create-dialog": DeviceCreateDialog;
  }
}
