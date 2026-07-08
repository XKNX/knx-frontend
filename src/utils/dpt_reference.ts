import type { DPTMetadata } from "../types/websocket";
import { compareDpt, dptToString, isApciPackedDptMain } from "./dpt";

export interface DptReferenceEntry {
  dpt: string;
  metadata: DPTMetadata;
}

export interface DptReferenceGroup {
  main: number;
  items: DptReferenceEntry[];
}

/**
 * Converts the raw DPT metadata map from the backend into a sorted list of entries,
 * ordered by main and sub DPT number.
 */
export const normalizeDptReferenceEntries = (
  dptMetadata: Record<string, DPTMetadata>,
): DptReferenceEntry[] =>
  Object.values(dptMetadata)
    .map((metadata) => ({
      dpt: dptToString({ main: metadata.main, sub: metadata.sub }),
      metadata,
    }))
    .sort((left, right) =>
      compareDpt(
        { main: left.metadata.main, sub: left.metadata.sub },
        { main: right.metadata.main, sub: right.metadata.sub },
      ),
    );

/**
 * Filters DPT entries by a free-text search string, matching against the DPT number,
 * name, unit, enum options, and complex schema field names/enum options.
 */
export const filterDptReferenceEntries = (
  entries: DptReferenceEntry[],
  filter: string,
): DptReferenceEntry[] => {
  const filterLower = filter.trim().toLowerCase();
  if (!filterLower) {
    return entries;
  }

  return entries.filter((entry) => {
    const { metadata } = entry;
    const label = metadata.name?.toLowerCase() ?? "";
    const unit = metadata.unit?.toLowerCase() ?? "";

    if (
      entry.dpt.toLowerCase().includes(filterLower) ||
      label.includes(filterLower) ||
      unit.includes(filterLower)
    ) {
      return true;
    }

    if (metadata.options?.some((option) => option.toLowerCase().includes(filterLower))) {
      return true;
    }

    return !!metadata.schema?.some(
      (field) =>
        field.name.toLowerCase().includes(filterLower) ||
        (field.type === "enum" &&
          field.options?.some((option) => option.toLowerCase().includes(filterLower))),
    );
  });
};

/** Groups DPT entries by their main DPT number, sorted ascending. */
export const groupDptReferenceEntries = (entries: DptReferenceEntry[]): DptReferenceGroup[] => {
  const groupedEntries = new Map<number, DptReferenceEntry[]>();

  entries.forEach((entry) => {
    const main = entry.metadata.main;
    if (!groupedEntries.has(main)) {
      groupedEntries.set(main, []);
    }
    groupedEntries.get(main)!.push(entry);
  });

  return Array.from(groupedEntries.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([main, items]) => ({
      main,
      items,
    }));
};

/** Small groups (fewer than 4 DPTs) are rendered fully expanded instead of collapsible. */
export const shouldRenderDptGroupAsCards = (group: DptReferenceGroup): boolean =>
  group.items.length < 4;

/**
 * Returns the payload length to display for a DPT group. DPT 1.x/2.x/3.x are always
 * shown as 0 (see `isApciPackedDptMain`); otherwise the first item's backend value is used,
 * since payload length is constant across all DPTs sharing a main number.
 */
export const groupPayloadLength = (group: DptReferenceGroup): number | undefined =>
  isApciPackedDptMain(group.main) ? 0 : group.items[0]?.metadata.payload_length;
