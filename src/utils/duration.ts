import type { HaDurationData } from "@ha/components/ha-duration-input";

export { durationDataToSeconds } from "@ha/common/datetime/duration_to_seconds";

/**
 * Split a number of seconds into the fields of HA's duration input.
 *
 * KNX schemas carry durations as seconds; this is the display direction of
 * that contract. Rounds to whole milliseconds so every field is an integer.
 */
export const secondsToDurationData = (seconds: number): HaDurationData => {
  const totalMilliseconds = Math.round(seconds * 1000);
  return {
    days: Math.floor(totalMilliseconds / 86_400_000),
    hours: Math.floor((totalMilliseconds % 86_400_000) / 3_600_000),
    minutes: Math.floor((totalMilliseconds % 3_600_000) / 60_000),
    seconds: Math.floor((totalMilliseconds % 60_000) / 1000),
    milliseconds: totalMilliseconds % 1000,
  };
};
