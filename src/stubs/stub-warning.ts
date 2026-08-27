// Shared by everything in this directory. See build-scripts/stubs.cjs for the list of
// modules that get replaced and why.

/**
 * Report that a stubbed-out module was actually reached.
 *
 * `name` must match the `name` of the entry in build-scripts/stubs.cjs, so that whoever
 * reads this in a console can find the one place that put the stub there.
 */
export const warnStubbed = (name: string, detail: string): void => {
  // eslint-disable-next-line no-console
  console.warn(
    `[KNX] "${name}" is stubbed out in this build, so ${detail} does not work here. ` +
      "The KNX panel is not supposed to need it — if it does, remove the entry from " +
      "build-scripts/stubs.cjs.",
  );
};
