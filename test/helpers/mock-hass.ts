import { vi } from "vitest";

import type { HomeAssistant } from "@ha/types";

export interface MockHassOptions {
  language?: string;
  /** Backend or frontend translations by full key; `{name}` placeholders are replaced. */
  translations?: Record<string, string>;
}

/**
 * Minimal `hass` for rendering KNX panel components in tests.
 *
 * Like Home Assistant, `localize` returns an empty string for unknown keys,
 * so components fall back to their local translations.
 */
export const createMockHass = ({
  language = "en",
  translations = {},
}: MockHassOptions = {}): HomeAssistant =>
  ({
    language,
    locale: {
      language,
      number_format: "language",
      time_format: "24",
      date_format: "language",
      time_zone: "server",
      first_weekday: "language",
    },
    config: { time_zone: "Etc/UTC" },
    localize: vi.fn((key: string, replace?: Record<string, string>) =>
      (translations[key] ?? "").replace(/\{(\w+)\}/g, (_, name) => replace?.[name] ?? ""),
    ),
  }) as unknown as HomeAssistant;
