/**
 * KNX Telegram Row Data Model
 *
 * Transforms telegram data into a structured format for data table display.
 * Handles both human-readable and numeric address formats for sorting and
 * filtering operations.
 */

import type { DataTableRowData } from "@ha/components/data-table/ha-data-table";
import { slugify } from "@ha/common/string/slugify";
import type { TelegramDict } from "../../../types/websocket";
import { TelegramDictFormatter } from "../../../utils/format";

/**
 * Time offset in microseconds for relative timestamp calculations
 * null indicates the first telegram in a series (no previous telegram to compare with)
 */
export type OffsetMicros = number | null;

/**
 * Precision level for time formatting
 */
export type TimePrecision = "milliseconds" | "microseconds";

/**
 * Type for TelegramRow property keys
 * Provides type safety when referencing TelegramRow properties
 */
export type TelegramRowKeys = keyof TelegramRow;

/**
 * KNX telegram row model implementing the DataTableRowData interface
 * Transforms raw telegram data into a structured format for table display
 */

export class TelegramRow implements DataTableRowData {
  // ============================================================================
  // Core Identification Properties
  // ============================================================================

  /**
   * Unique identifier for this telegram row
   * Generated from timestamp and address information to ensure uniqueness
   * Sanitized to contain only alphanumeric characters for safe DOM usage
   */
  id: string;

  /**
   * Original timestamp string as received from the telegram
   * Preserves the microsecond precision that Date objects do not support
   */
  timestampIso: string;

  /**
   * Parsed timestamp when the telegram was captured
   * Converted from ISO 8601 string to Date object for processing
   */
  timestamp: Date;

  /**
   * Time offset for relative timestamp calculations
   * null indicates the first telegram (no previous telegram for comparison)
   * number represents microseconds elapsed since the previous telegram
   */
  offset: OffsetMicros = null;

  // ============================================================================
  // Source Address Information
  // ============================================================================

  /**
   * Raw source address string as received from KNX bus
   */
  sourceAddress: string;

  /**
   * Human-readable name/description for the source address
   * May be null if no name mapping is available in the system
   */
  sourceText: string | null;

  /**
   * Combined source display name including both address and description
   * Format: "address: description" for comprehensive identification
   */
  sourceName: string | null;

  // ============================================================================
  // Destination Address Information
  // ============================================================================

  /**
   * Raw destination address string as received from KNX bus
   */
  destinationAddress: string;

  /**
   * Human-readable name/description for the destination address
   * May be null if no name mapping is available in the system
   */
  destinationText: string | null;

  /**
   * Combined destination display name including both address and description
   */
  destinationName: string | null;

  // ============================================================================
  // Telegram Metadata Properties
  // ============================================================================

  /**
   * Type classification of the KNX telegram
   * Examples: "GroupValueRead", "GroupValueWrite", "GroupValueResponse"
   */
  type: string;

  /**
   * Direction indicator for the telegram flow
   * Shows whether telegram is incoming or outgoing relative to the monitor
   */
  direction: string;

  // ============================================================================
  // Payload and Value Properties
  // ============================================================================

  /**
   * Raw payload data from the telegram
   * May be null for telegrams without payload data
   */
  payload: string | null;

  /**
   * Data Point Type (DPT) information for the telegram
   */
  dpt: string | null;

  /**
   * Unit of measurement for the telegram value
   * May be null for dimensionless or unknown value types
   */
  unit: string | null;

  /**
   * Indicates whether the telegram was sent using DataSecure (encrypted) communication
   * true = secure, false = not secure, undefined / null = unknown (undefined for historic telegrams without this flag)
   */
  dataSecure?: boolean | null;

  /**
   * Processed and formatted value for display
   * Prioritizes formatted value with units, falls back to payload or type-specific defaults
   */
  value: string | null;

  // ============================================================================
  // Constructor and Data Transformation
  // ============================================================================

  /**
   * Constructs a TelegramRow from raw telegram dictionary data
   *
   * Performs comprehensive data transformation including:
   * - Input sanitization for safe ID generation
   * - Address parsing with numeric extraction
   * - Timestamp conversion and validation
   * - Payload formatting using specialized formatters
   * - Value resolution with fallback hierarchy
   * - Name composition for display purposes
   *
   * @param telegram - Raw telegram data from WebSocket API
   */
  constructor(telegram: TelegramDict) {
    // ============================================================================
    // Unique ID Generation
    // ============================================================================

    /**
     * Generate unique identifier from timestamp and address components
     * Combines multiple fields to minimize collision risk
     * Format: "timestamp_source_destination" (sanitized)
     */
    this.id = slugify(`${telegram.timestamp}_${telegram.source}_${telegram.destination}`);

    // ============================================================================
    // Timestamp Processing
    // ============================================================================

    /** Store original timestamp string for reference */
    this.timestampIso = telegram.timestamp;

    /** Convert timestamp string to Date object for proper date/time handling */
    this.timestamp = new Date(telegram.timestamp);

    // ============================================================================
    // Source Address Data Extraction
    // ============================================================================

    this.sourceAddress = telegram.source;
    this.sourceText = telegram.source_name;
    this.sourceName = `${telegram.source}: ${telegram.source_name}`;

    // ============================================================================
    // Destination Address Data Extraction
    // ============================================================================

    this.destinationAddress = telegram.destination;
    this.destinationText = telegram.destination_name;
    this.destinationName = `${telegram.destination}: ${telegram.destination_name}`;

    // ============================================================================
    // Telegram Classification
    // ============================================================================

    this.type = telegram.telegramtype;
    this.direction = telegram.direction;

    // ============================================================================
    // Payload and Value Processing
    // ============================================================================

    /** Format raw payload using specialized telegram formatter */
    this.payload = TelegramDictFormatter.payload(telegram);

    /** Extract and format DPT information for technical reference */
    this.dpt = TelegramDictFormatter.dptNameNumber(telegram);

    /** Store unit information for value context */
    this.unit = telegram.unit;

    /** Store data security flag for display */
    this.dataSecure = telegram.data_secure;

    /**
     * Determine best display value using fallback hierarchy:
     * 1. Formatted value with unit (preferred for user display)
     * 2. Raw payload (technical fallback)
     * 3. Type-specific default (e.g., "GroupRead" for read requests)
     */
    this.value =
      TelegramDictFormatter.valueWithUnit(telegram) ||
      this.payload ||
      (telegram.telegramtype === "GroupValueRead" ? "GroupRead" : "");
  }
}
