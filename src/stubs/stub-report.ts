// Shared by everything in this directory. See build-scripts/stubs.cjs for the list of
// modules that get replaced and why.

/**
 * Report that a stubbed-out module was actually reached.
 *
 * This is an error, not a warning: reaching one of these means the panel is missing a
 * feature it just tried to use, and the console filter that hides warnings is exactly
 * where that would go unnoticed.
 *
 * `name` must match the `name` of the entry in build-scripts/stubs.cjs, so that whoever
 * reads this in a console can find the one place that put the stub there.
 */
export const reportStubbed = (name: string, detail: string): void => {
  // eslint-disable-next-line no-console
  console.error(
    `[KNX] "${name}" is stubbed out in this build, so ${detail} does not work here. ` +
      "The KNX panel is not supposed to need it — if it does, remove the entry from " +
      "build-scripts/stubs.cjs.",
  );
};
